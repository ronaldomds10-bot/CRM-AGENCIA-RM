# Sistema Agência RM

Central operacional da RM Partiu Viagens para gerenciar orçamentos, emissões, clientes, fornecedores, calendário e indicadores financeiros.

## Tecnologias previstas

- Next.js
- React
- PostgreSQL no Railway
- Sessão segura com cookie HttpOnly
- Row Level Security
- TypeScript
- Tailwind CSS

## Estrutura atual

A interface sincroniza os dados com PostgreSQL por uma API privada do Next.js. O armazenamento local permanece como contingência e também importa automaticamente a base do navegador no primeiro acesso a um banco vazio.

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
DATABASE_URL=
CRM_ADMIN_EMAIL=
CRM_ACCESS_PASSWORD=
CRM_AUTH_SECRET=
```

Nunca versione `.env`, `.env.local`, `.env.production` ou qualquer arquivo com chaves reais.

## Como rodar localmente

Instale as dependencias e rode o servidor local:

```bash
npm install
npm run dev
```

## Próximos passos

- Configurar `DATABASE_URL`, `CRM_ADMIN_EMAIL`, `CRM_ACCESS_PASSWORD` e `CRM_AUTH_SECRET` no ambiente de produção.
- Manter backups periódicos do PostgreSQL e pelo exportador JSON do sistema.
- Adicionar geração final de PDF e compartilhamento de orçamentos.
