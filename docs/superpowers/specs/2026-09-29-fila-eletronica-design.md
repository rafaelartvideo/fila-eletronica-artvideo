# Sistema de fila da Eletrônica Artvideo

## Objetivo

Criar um sistema web independente para organizar o atendimento presencial da Eletrônica Artvideo. A equipe deve poder emitir e administrar senhas; clientes também poderão emitir senhas por autoatendimento. Um display público mostrará as chamadas em tempo real e poderá reproduzir vídeos informativos.

## Escopo da primeira versão

- Painel da equipe para cadastrar tipos de atendimento, emitir senhas para clientes, chamar a próxima senha, repetir chamada, iniciar atendimento, concluir ou cancelar uma senha.
- Totem de autoatendimento para selecionar um tipo de atendimento e gerar uma senha.
- Display público para mostrar chamada atual e senhas recentes, com atualização em tempo real.
- Configuração do display para adicionar, remover e ordenar URLs de mídia; links do YouTube serão convertidos para incorporação. Outros provedores só reproduzirão se permitirem incorporação no navegador.
- Layout responsivo para computador, tablet, celular e tela de TV.
- Senhas numeradas com data e tipo de atendimento. A data de negócio usa o fuso `America/Sao_Paulo`. A geração deve ser atômica no banco, compartilhada pelo painel e totem, sem duplicação em emissões concorrentes.

## Fora do escopo inicial

- Integração com o CRM Union World ou com o banco de produção existente.
- Impressão térmica e integração com hardware de totem.
- Relatórios avançados, notificações por SMS/WhatsApp, agendamento e múltiplas unidades.
- Autorização por papéis além dos necessários para separar o painel administrativo das rotas públicas.

## Arquitetura proposta

- Frontend em React e TypeScript, com rotas distintas para painel, autoatendimento e display.
- Supabase em projeto dedicado para autenticação administrativa, banco PostgreSQL e atualização em tempo real. O banco será provisionado com uma migração SQL revisável.
- Regras críticas de emissão e transição de estado implementadas no banco por funções transacionais, com validação de acesso por RLS. Rotas públicas terão permissão apenas para emitir senhas com os campos permitidos e consultar dados apropriados ao display.
- Configuração de ambiente por variáveis, com `.env.example` e instruções de instalação e publicação no README. Nenhuma chave será incluída no repositório.

## Dados e regras

- Tipos de atendimento: nome, ativo/inativo e ordem de exibição.
- Senha: identificador, número visível, data local, tipo de atendimento, nome opcional, estado, guichê opcional e horários de criação/chamada/início/conclusão.
- Estados: aguardando, chamada, em atendimento, concluída e cancelada. Repetir chamada mantém a senha no estado chamada e registra a nova hora da chamada.
- Sequência reinicia por dia em `America/Sao_Paulo` e tipo de atendimento. Emissões concorrentes não podem gerar o mesmo número.
- A fila respeita ordem de criação dentro de cada tipo de atendimento; atendimentos prioritários ficam fora da primeira versão até existir uma regra de prioridade definida.
- Itens de mídia: URL, provedor reconhecido, título opcional, posição e ativo/inativo.

## Fluxos principais

### Equipe

1. Entrar no painel protegido.
2. Selecionar o tipo de atendimento, registrar opcionalmente o nome do cliente e emitir uma senha.
3. Chamar a próxima senha de uma fila escolhida; a ação atualiza o display em tempo real.
4. Repetir a chamada, iniciar o atendimento, concluir ou cancelar a senha.
5. Abrir as configurações do display e manter a lista de mídias.

### Autoatendimento

1. Escolher o tipo de atendimento ativo.
2. Opcionalmente informar o nome.
3. Emitir e mostrar a senha em tela, com opção de impressão do navegador como fallback quando o dispositivo tiver impressora configurada.

### Display

1. Inscrever-se nas atualizações da fila e mostrar a chamada mais recente e histórico curto.
2. Destacar a nova chamada e usar um alerta visual e sonoro discreto, sujeito às regras de áudio automático do navegador.
3. Reproduzir a lista de mídia configurada e retornar à fila quando não houver vídeo ou ocorrer falha de incorporação.

## Segurança, falhas e limites

- O painel exige autenticação; senhas públicas não expõem nome completo nem dados pessoais no display.
- A geração da senha valida tipo de atendimento ativo e faz a alocação em transação.
- Se a conexão em tempo real cair, o display deve tentar reconectar e consultar o estado atual ao retomar.
- Erros de emissão ou transição aparecem em linguagem clara e preservam os dados já confirmados.
- Sites que proíbem incorporação não podem ser forçados a tocar dentro do display; mostrar uma mensagem de mídia indisponível e manter a fila visível.
- Sem credenciais e projeto Supabase dedicados, a aplicação poderá ser preparada, mas não ficará operacional em produção. O setup documentará as variáveis e a migração SQL.

## Critérios de aceite

- Atendente e totem conseguem emitir senhas sem duplicação, inclusive em emissões simultâneas.
- A equipe consegue chamar, repetir, iniciar, concluir e cancelar senhas válidas; transições inválidas são recusadas.
- O display reflete chamadas novas sem atualização manual e recupera o estado após reconexão.
- Um link do YouTube compatível toca no display; link externo não incorporável apresenta fallback sem esconder a fila.
- As três rotas funcionam em telas pequenas e grandes, sem sobreposição dos controles principais.
- O painel é protegido, as rotas públicas não expõem a fila administrativa completa e segredos não são versionados.
- Instruções explicam como configurar o Supabase, iniciar localmente e publicar o frontend.

## Decisões ainda fora do desenho aprovado

- Nome final do repositório sugerido: `fila-eletronica-artvideo`.
- Nenhum provedor de hospedagem foi escolhido.
- Nenhum número de guichê, prioridade ou duração de retenção do histórico foi especificado; a primeira versão usará uma fila padrão por tipo de atendimento e histórico curto no display.
