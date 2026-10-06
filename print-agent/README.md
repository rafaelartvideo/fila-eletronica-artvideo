# Union Fila Print Agent

Agente gratuito para Windows que recebe trabalhos do sistema de filas e envia ESC/POS RAW diretamente para a Elgin i9.

## Instalação

1. No banco do sistema de filas, aplique o arquivo supabase/print-agent-setup.sql.
2. No painel administrativo, abra Impressora.
3. Gere uma nova chave para o agente reception.
4. Clique em Baixar config.json e coloque o arquivo nesta pasta.
5. Confirme que o driver da Elgin i9 está instalado no Windows.
6. Execute setup.ps1 com PowerShell.
7. Se o nome da impressora do Windows for diferente, o setup permite escolhê-la.
8. O agente inicia na hora e passa a iniciar automaticamente no login do Windows.

Depois disso, qualquer celular, tablet ou PC que use o sistema pode clicar em Imprimir senha. O pedido passa pelo Supabase e este PC envia o trabalho RAW para a Elgin, com alinhamento central e avanço curto para destaque manual do papel.

## Ajustes

No config.json:
- `feedLines`: quantidade de linhas avançadas até a serrilha; o padrão atual é 13.
- `pollIntervalMs`: intervalo rápido usado logo após atividade; padrão de 1000 ms.
- `idlePollIntervalMs`: intervalo máximo quando a fila de impressão fica ociosa; padrão de 10000 ms.
- `operatingStartHour`: hora em que o agente começa a consultar o Supabase; padrão 7.
- `operatingEndHour`: hora em que o agente para de consultar o Supabase; padrão 20.

O polling é adaptativo: começa rápido e, se não houver trabalho, desacelera gradualmente até `idlePollIntervalMs`. Quando imprime algo, volta imediatamente ao intervalo rápido.

Entre 20:00 e 07:00, por padrão, o processo continua aberto no Windows, mas não faz consultas ao Supabase. Ele apenas aguarda localmente e retoma sozinho no início do horário de operação.

A impressora configurada não usa guilhotina, por isso o agente não envia comandos ESC/POS de corte.

Nenhuma chave service-role é usada. O agente recebe apenas a chave pública do projeto e uma credencial própria gerada no painel.
