# Fila Artvideo

Sistema web de senhas para a Eletrônica Artvideo. A equipe gerencia a fila, o cliente pode retirar senha no totem, e uma TV mostra as chamadas recentes junto com vídeos da loja.

## Recursos

- `/painel` — painel protegido para a equipe, com emissão manual, chamadas, repetição, início e conclusão de atendimento.
- `/totem` — emissão de senha sem nome obrigatório e opção de impressão no navegador.
- `/display` — chamadas em tempo real, histórico recente, voz opcional e playlist de vídeos.
- Numeração atômica por serviço, reiniciada a cada dia às 00h no fuso `America/Sao_Paulo`.
- Dados de identificação só aparecem no painel autenticado. A tela pública recebe uma tabela de chamadas sem nome ou telefone.
- Links do YouTube são convertidos para incorporação sem cookies. Outros links precisam permitir incorporação no site externo.

## Tecnologia

React, TypeScript, Vite e Supabase (PostgreSQL, Auth e Realtime). A aplicação web não contém segredo de servidor. A chave publicável/anon do Supabase é configurada no navegador; nunca configure a chave `service_role` no frontend.

## Rodar localmente

Requisitos: Node.js 20.19+ ou 22.12+, npm e Docker compatível com Supabase CLI.

```bash
npm install
npx supabase start
npx supabase db reset
cp .env.example .env
```

Copie a URL e a chave `anon`/publishable exibidas por `npx supabase status` para `.env` e inicie o site:

```bash
npm run dev
```

O banco local fica no Supabase Studio, em `http://127.0.0.1:54323`. As rotas são servidas pelo Vite em `http://localhost:5173`.

### Criar o primeiro administrador

1. No Studio, abra **Authentication → Users → Add user** e crie a conta da equipe com e-mail e senha.
2. Copie o UUID do usuário.
3. No SQL Editor do Studio, execute:

```sql
insert into private.admin_users (user_id)
values ('UUID-DO-USUARIO');
```

Entre em `/painel` com essa conta e adicione os tipos de atendimento e vídeos. A tabela `private.admin_users` não é exposta pela API pública.

## Configurar Supabase hospedado

Crie um projeto Supabase dedicado e mantenha os dados de atendimento nesse projeto. Ative **Authentication → Sign In / Providers → Anonymous sign-ins** para o totem. Aplique a migração versionada pelo CLI:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Crie o primeiro usuário e inclua seu UUID em `private.admin_users` pelo SQL Editor, como acima.

Configure `.env` (ou as variáveis do serviço de hospedagem) com:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publishable-ou-anon
```

O plano gratuito é adequado para protótipo e operação inicial com tráfego modesto. Confira limites, pausa por inatividade e política de backups diretamente no painel do Supabase antes de depender dele em horário comercial.

## Testes e verificação

```bash
npm test -- --run
npm run test:db-contract
npx supabase test db
npm run test:e2e
npm run build
```

`test:db-contract` executa a migração real em PostgreSQL pelo PGlite; é uma alternativa rápida quando Docker não está disponível. `supabase test db` roda os testes pgTAP no Supabase local. Os testes Playwright simulam as respostas da API e cobrem o percurso do painel, totem, impressão, display e redirecionamento sem login.

Instale o navegador de teste uma vez com `npx playwright install chromium` antes de rodar `npm run test:e2e`.

O teste de concorrência gera 25 senhas no banco configurado. Use o projeto Supabase local, crie um serviço ativo no painel e passe o seu UUID:

```bash
QUEUE_TEST_TYPE_ID=uuid-do-servico npm run test:queue-concurrency
```

O script recusa URLs não locais por padrão. Para um projeto hospedado, só prossiga se aceitar inserir 25 senhas de teste: `ALLOW_NONLOCAL_QUEUE_TEST=true`.

## Publicação

Gere a versão estática com `npm run build` e publique a pasta `dist/` em um host compatível com SPA. Configure as duas variáveis `VITE_SUPABASE_*` no ambiente de build e faça o host redirecionar rotas desconhecidas para `index.html`. A URL do display pode ser aberta em modo tela cheia no computador ou TV conectada.

## Privacidade e operação

O nome é opcional e serve para a equipe localizar o cliente. O painel mostra os nomes; o totem, a impressão e o display mostram apenas o número e o tipo de atendimento. Defina uma rotina operacional para retenção ou remoção dos dados de clientes conforme a política da loja.
