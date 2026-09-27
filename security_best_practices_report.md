# Security Review — RM Travel Hub

Data: 2026-09-26. Escopo: código versionado em `src/`, `scripts/`, `migrations/`, configuração Next.js e dependências de produção. Referência: OWASP Top 10:2025, OWASP API Security e guias oficiais do Next.js 16.

## Resumo executivo

- Crítico: 0
- Alto: 4 (3 corrigidos; 1 depende de infraestrutura Railway)
- Médio: 4 (corrigidos)
- Baixo: 1 (corrigido)
- Não foram encontradas SQL/NoSQL/Command Injection confirmadas. Consultas com entrada externa usam parâmetros do `pg`; fragmentos SQL dinâmicos vêm de listas internas.
- Nenhum segredo hardcoded foi encontrado no código versionado. `.env.local` está ignorado e não há histórico Git de arquivos `.env` reais.
- Cookies já tinham `HttpOnly`, `Secure` em produção, `SameSite=Strict` e token aleatório armazenado apenas como SHA-256.

## 1. Exposição excessiva e conteúdo público forjado em orçamentos

**Risco: Alto — corrigido**  
**OWASP:** A01 Broken Access Control / API3 Broken Object Property Level Authorization  
**Local original:** `src/app/api/shared-quotes/route.ts:16-28`, `src/app/api/shared-quotes/[id]/route.ts:30-34`, `src/components/rm-app.tsx:911-925`.

Trechos problemáticos:

```ts
const payload = await request.json();
const safePayload = { quote: { ...payload.quote, ownerId: quote.ownerId, assignedUserId: quote.assignedUserId }, ... };
return NextResponse.json({ ...payload, quote: publicQuote });
return JSON.parse(new TextDecoder().decode(bytes)) as SharedQuote;
```

Impacto: qualquer portador do link recebia o objeto completo da emissão, inclusive custo interno, fornecedor de milhas, localizador, nomes/tickets de passageiros e anexos em Base64. O fluxo legado por `#share=` também permitia criar uma página falsa com a marca do sistema sem validação do servidor.

Correção pronta e aplicada:

```ts
const payload = await readJsonBody<{ quoteId?: string }>(request, 16 * 1024);
const quote = data.quotes.find((item) => item.id === payload.quoteId);
if (!quote || !canAccessRecord(quote, user)) return forbidden();
const safePayload = {
  quote: publicQuoteDto(quote),
  settings: publicSettingsDto(settingsForUser(data, user)),
};
```

Implementação completa: `src/lib/shared-quote.ts`, `src/app/api/shared-quotes/route.ts` e `src/app/api/shared-quotes/[id]/route.ts`. O DTO agora remove anexos, custos, emissão, localizadores e dados individuais dos passageiros. O compartilhamento legado sem assinatura foi removido.

## 2. Senha antiga do administrador continuava válida

**Risco: Alto — corrigido**  
**OWASP:** A07 Authentication Failures  
**Local original:** `src/app/api/auth/login/route.ts:21-25`.

Trecho problemático:

```ts
const admin = adminCredentialsMatch(email, password);
if (!user?.active || (!(admin && user.id === "admin") && !verifyPassword(password, user.password_hash))) {
```

Impacto: após alterar a senha do administrador pela interface, a senha antiga de `CRM_ACCESS_PASSWORD` permanecia válida. Uma credencial antiga comprometida não era realmente revogada.

Correção pronta e aplicada:

```ts
const authenticated = user?.id === "admin" && !user.password_hash
  ? adminCredentialsMatch(email, password) // somente bootstrap
  : verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
```

Implementação completa: `src/app/api/auth/login/route.ts:29-33`. Depois que existe `password_hash`, somente a senha atual do banco autentica. O hash fictício reduz enumeração por tempo de resposta.

## 3. Mutações autenticadas sem proteção CSRF explícita

**Risco: Alto — corrigido**  
**OWASP:** A01 Broken Access Control / CSRF  
**Locais originais:** todas as rotas `POST`, `PUT` e `PATCH` em `src/app/api/`; chamadas correspondentes em `src/components/rm-app.tsx`.

Trecho problemático representativo:

```ts
export async function PATCH(request: NextRequest) {
  const actor = await getSessionUser(request);
  // sem token/header/origin CSRF
}
```

Impacto: o sistema dependia apenas de `SameSite=Strict`. Uma mudança de navegador, proxy/CORS ou fluxo futuro poderia permitir ações em nome de uma sessão ativa, inclusive alteração de usuários e estado do CRM.

Correção pronta e aplicada:

```ts
export function isTrustedMutation(request: NextRequest) {
  if (request.headers.get("x-rm-csrf") !== "1") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).origin === request.nextUrl.origin;
}
```

Implementação completa: `src/lib/security.ts:12-22`. Todas as mutações validam o header e origem; o cliente envia `X-RM-CSRF: 1`. Navegadores não conseguem enviar esse header cross-origin sem preflight, e o projeto não libera CORS.

## 4. Rate limit de login apenas em memória

**Risco: Médio — corrigido**  
**OWASP:** A07 Authentication Failures  
**Local original:** `src/lib/rate-limit.ts:1-14` e `src/app/api/auth/login/route.ts:15-16`.

Trecho problemático:

```ts
const attempts = new Map<string, { count: number; resetAt: number }>();
```

Impacto: em Vercel, cada instância tem memória independente e reinícios apagam os contadores. Um atacante podia distribuir tentativas entre instâncias para contornar o bloqueio.

Correção pronta e aplicada: `src/lib/auth.ts:65-88` usa contador atômico persistente no PostgreSQL, com chaves SHA-256 separadas por conta e IP. A tabela está em `migrations/20260926_security_hardening.sql` e também é criada de forma idempotente no primeiro login.

## 5. Ausência de headers de segurança

**Risco: Médio — corrigido**  
**OWASP:** A02 Security Misconfiguration  
**Local original:** `next.config.ts:3-5`.

Trecho problemático:

```ts
const nextConfig = { serverExternalPackages: ["pdf-parse"] };
```

Impacto: o site podia ser incorporado em iframe para clickjacking e não tinha hardening explícito contra MIME sniffing, abuso de permissões e downgrade HTTPS.

Correção pronta e aplicada: `next.config.ts:5-16` adiciona CSP para `base-uri`, `frame-ancestors`, `object-src` e `form-action`, além de `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS. Uma CSP estrita de scripts com nonce deve ser uma etapa separada, pois exige renderização dinâmica no Next.js 16.

## 6. Validação/tamanho de payload e mensagens internas

**Risco: Médio — corrigido**  
**OWASP:** A05 Injection / A10 Mishandling of Exceptional Conditions  
**Locais originais:** `src/app/api/crm-state/route.ts:30`, `src/app/api/quotes/import/route.ts:523-539`, demais rotas JSON.

Trechos problemáticos:

```ts
const data = await request.json();
return NextResponse.json({ error: error.message }, { status: 500 });
```

Impacto: payloads excessivos elevavam consumo de memória/CPU e exceções de parser/banco podiam revelar detalhes internos.

Correção pronta e aplicada: `src/lib/security.ts:24-36` exige JSON, limita bytes reais e declarados e normaliza erros. CRM aceita no máximo 8 MiB; login 4 KiB; endpoints administrativos 8 KiB. Importações só retornam mensagens esperadas e registram o restante no servidor.

## 7. Dependência com advisory de DoS

**Risco: Médio — corrigido**  
**OWASP:** A03 Software Supply Chain Failures  
**Local original:** `package-lock.json` — `baseline-browser-mapping@2.10.36` (`GHSA-w5vr-8v7q-w6rv`).

Impacto: entrada inválida podia encerrar o processo que utilizasse a dependência.

Correção aplicada: lockfile atualizado para `baseline-browser-mapping@2.11.26`. `npm audit --omit=dev` agora retorna 0 vulnerabilidades.

## 8. Estatísticas globais expostas a usuário comum

**Risco: Baixo — corrigido**  
**OWASP:** A01 Broken Access Control / BOLA  
**Local original:** `src/lib/holiday-db.ts:150-160`.

Trecho problemático:

```ts
const clients = payload.clients;
return { clientsWithIbge: clients.filter(...).length };
```

Impacto: um usuário restrito via contagens agregadas de todos os clientes da agência, não apenas dos registros próprios/atribuídos.

Correção aplicada: `holidayStats(user)` filtra com `canAccessRecord`, e `listHolidayOpportunities` passa o usuário autenticado.

## 9. TLS do PostgreSQL sem validação de certificado

**Risco: Alto — pendência de infraestrutura**  
**OWASP:** A02 Security Misconfiguration / A04 Cryptographic Failures  
**Local:** `src/lib/db.ts:16-20` e `scripts/migrate-access.cjs:9`.

Trecho problemático:

```ts
ssl: railwayPublicProxy ? { rejectUnauthorized: false } : undefined
```

Impacto: o tráfego é cifrado, mas um atacante com posição de rede pode apresentar outro certificado e interceptar credenciais/dados do banco.

O template oficial da Railway usa CA própria e certificado com SAN `localhost`; portanto, ativar `rejectUnauthorized: true` sem fornecer essa CA derruba produção. Correção pronta após instalar a CA no ambiente:

```ts
const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
if (railwayPublicProxy && !ca) throw new Error("DATABASE_SSL_CA não configurada.");
ssl: railwayPublicProxy
  ? { ca, servername: "localhost", rejectUnauthorized: true }
  : undefined,
```

Necessário: exportar `root.crt` do serviço Railway, cadastrar como `DATABASE_SSL_CA` na Vercel e então substituir os dois pontos acima. Esta alteração não foi ativada automaticamente para não causar indisponibilidade do CRM.

## Verificações

- `npx tsc --noEmit`: aprovado.
- Testes unitários: 8 aprovados.
- 3 testes E2E não executaram porque exigem servidor local em `localhost:3008`; conforme solicitado, não houve build nem servidor local.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Segredos: nenhuma credencial versionada detectada; `.env.local` ignorado.

## Referências

- https://top10.owasp.org/2025/
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://nextjs.org/docs/app/guides/data-security
- https://github.com/railwayapp-templates/postgres-ssl
