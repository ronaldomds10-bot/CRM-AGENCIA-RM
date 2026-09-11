# Sistema Agência RM

Central operacional da RM Partiu Viagens para gerenciar orçamentos, emissões, clientes, fornecedores, calendário e indicadores financeiros.

## Tecnologias previstas

- Next.js
- React
- Supabase Auth
- Supabase Postgres
- Row Level Security
- TypeScript
- Tailwind CSS

## Estrutura atual

A interface funciona com persistência local no navegador e backup em JSON. A integração remota deve receber uma migration própria do CRM quando o projeto Supabase definitivo for conectado.

Principais módulos:

- Dashboard operacional e financeiro.
- Orçamentos com voos, carros, hospedagens e seguro viagem.
- Emissões e dados de reserva.
- Clientes e passaportes.
- Fornecedores.
- Calendário e eventos.
- Configurações da empresa e taxas de parcelamento.

## Variaveis de ambiente

Crie um arquivo `.env.local` baseado em `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Nunca versione `.env`, `.env.local`, `.env.production` ou qualquer arquivo com chaves reais.

## Como rodar localmente

Com a Supabase CLI instalada:

```bash
supabase start
```

Instale as dependencias e rode o servidor local:

```bash
npm install
npm run dev
```

## Próximos passos

- Criar uma migration própria para os módulos da agência.
- Integrar autenticação e persistência remota.
- Substituir o armazenamento local pelo Supabase mantendo o backup em JSON.
- Adicionar geração final de PDF e compartilhamento de orçamentos.
