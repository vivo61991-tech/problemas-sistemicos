# Problemas Sistêmicos (v1.7.0)

PWA que mostra o andamento dos chamados de problemas sistêmicos em tempo real, a partir do `sistemas.txt` (o mesmo arquivo usado no Painel - Nível de Serviço). Mesmas cores da empresa do painel de NS.

## Como os dados chegam
- O arquivo `sistemas.txt` fica na raiz do repositório, junto do `index.html`.
- O MAPI atualiza esse arquivo no GitHub sempre que algo muda na origem.
- O app confere o arquivo **a cada 1 minuto** (e na hora em que a tela volta a ficar visível, ou ao tocar em ↻).
- No GitHub Pages, o app lê o arquivo **direto do repositório** (API do GitHub), sem o cache de até ~10 min do Pages. A conferência usa ETag: quando nada mudou, não gasta a cota da API. Se a API não responder, o app usa o `sistemas.txt` do próprio site.
- Para forçar a leitura pelo arquivo do site: abra com `?fonte=arquivo` no fim do endereço.

## Formato do arquivo
TXT do SQL Developer, separado por **tabulação**, cabeçalho na 1ª linha.
- **Obrigatórias:** `ID, SISTEMA, STATUS, DATA_INICIO`.
- **Usadas na tela:** `CHAMADO, CRITICIDADE, EVOLUCAO, SEGMENTO, IMPACTO_OPERACIONAL, DATA_FIM, TIPO_FALHA, GRUPOS_RESPONSAVEIS, GRUPOS_IMPACTADOS, AREA_ACIONADA, ALERTA_ENVIADO`.
- **Coluna nova:** pode entrar em qualquer posição; aparece no detalhe, em "Outras colunas".
- **Não aparecem na tela:** `FLAG, TEMPO_DECORRIDO, DADO_ATUALIZADO, DATA_ATUALIZACAO`. Continuam sendo lidas: a `DATA_ATUALIZACAO` serve para registrar "dados atualizados" nas mudanças e para escolher a linha mais recente quando um ID vem repetido.
- **Datas:** `20/10/26 08:22:00,000000000` (também aceita `20/10/2026 08:22` e `2026-10-20 08:22:00`).

## Páginas (menu de baixo)
A barra roxa do topo (título, situação "Ao vivo", 🔔 e ↻) fica sempre fixa e visível ao rolar.
1. **Ocorrências**: no topo, um card grande para cada chamado em andamento, com fundo branco tingido pela cor do tipo de falha e texto no tom escuro da mesma cor:
   - nome do sistema numa linha só (nome grande termina em "…") e, à direita, o **ID** da solicitação no sistêmico (cápsula só com borda);
   - o impacto (até 2 linhas; o texto completo fica no detalhe) e a cápsula do tipo de falha por extenso seguida dos segmentos: "Indisponibilidade parcial **para B2B e B2C**";
   - o número do chamado não aparece no card, só no detalhe (toque no card);
   - selo verde **NOVO** (ou **MUDOU**) metade dentro e metade fora do card, no canto inferior esquerdo, por 1 hora;
   - a **barra do dia**: expediente de hoje das 08h às 21h (traço = 14h), preenchida na cor do tipo de falha com o trecho que o chamado já ocupou hoje, até agora. Chamado que vem de ontem começa a contar às 08h de hoje. Atualiza ao vivo;
   - embaixo, o tempo "aberto há" correndo ao vivo e, à direita, o status (evolução) acima do início. Sem ocorrência, aparece o card verde "Nenhuma ocorrência ativa". Embaixo, os **chamados de hoje** (abertos primeiro, depois os encerrados) e as **últimas mudanças** de status. O número de ocorrências ativas aparece no ícone do menu.
   - **detalhe do chamado** (toque no card): no topo o **ID** em cápsula à esquerda do nome do sistema e o status (sem a criticidade); o **número do chamado** numa caixa do mesmo tamanho de Início/Fim, com ícone de copiar (tocar copia para a área de transferência e aparece "Chamado … copiado"), tudo do chamado (na lista de campos: Segmento, No expediente, Área acionada, Grupos responsáveis, Grupos impactados, **Evolução**, **Impacto** e Alerta enviado) e, no fim, a **Análise do histórico** do mesmo sistema com o mesmo tipo de falha, usando a base inteira (6 meses fechados + mês atual): **tempo médio**, **maior** e **menor** tempo (início → fim dos chamados encerrados, indevidos fora), se o chamado aberto está dentro ou acima da média, e a **frequência** ("ocorre em média a cada 9 dias" = dias da base ÷ ocorrências, contando desde o 1º dia do mês mais antigo do arquivo).
2. **Histórico**: todos os chamados por dia, com:
   - em **todas as listas** (Chamados de hoje, Últimas mudanças, Histórico e listas do Painel) o **ID** aparece numa cápsula só com borda, à esquerda do nome do sistema;
   - **busca** por texto (campo com lupa);
   - **filtro de sistema** numa lista própria do app (não a do navegador): nome à esquerda e quantidade de ocorrências (sem indevidos) numa cápsula lilás à direita. Com um sistema escolhido, a caixa mostra o nome, a quantidade e um **✕ à esquerda** para remover o filtro na hora;
   - filtro por tipo de falha (ou só indevidos).
3. **Painel**: o mesmo painel do app de NS: Dia / Semana / Mês (botão ou arrastar para o lado), filtro do dia da semana no modo Dia, seleção de coluna (toque no gráfico, na tabela ou no cabeçalho da matriz), cards, gráficos, matriz sistemas × períodos e tabela.

## Como o Painel monta os períodos
O `sistemas.txt` tem uma linha por chamado, então os períodos são montados pelo app:
- **Dia**: os 7 últimos dias (com filtro: as 7 últimas ocorrências daquele dia da semana).
- **Semana**: as 7 últimas semanas, de segunda a domingo.
- **Mês**: os 7 últimos meses do calendário.
- Um chamado conta em todos os períodos em que esteve ativo. O tempo é o trecho dentro do **expediente 08h–21h**; no total, sobreposição conta uma vez e indevido fica fora.
- **% do expediente** = tempo ÷ expediente do período inteiro (dia 13h; semana 7 × 13h; mês dias × 13h).
- Período em andamento leva `*` e não tem variação (ainda vai crescer). Período antes do 1º chamado do arquivo fica listrado ("sem dados").
- Variação: ▲ rosa = piorou, ▼ verde = melhorou.

## Cores
- Falha sempre em tons de vermelho a amarelo (rosa e laranja da empresa): Indisp. total `#D61F4F`, Indisp. parcial `#F2603E`, Intermitência `#FF9901`, Lentidão `#FFC629`. Total de todos os sistemas: rosa escuro `#B4245E`.
- **Verde** para "sem ocorrência" (card do topo, dia sem chamado, melhora) e para o selo de card novo.
- Chamado encerrado e indevido: neutro (cinza-lilás).

## Em andamento
- Chamado em andamento = `STATUS` ABERTO. Status desconhecido conta como em andamento enquanto não tiver `DATA_FIM`. FECHADO e INDEVIDO nunca contam.
- Ordem: criticidade (P0 primeiro) e, dentro dela, o aberto há mais tempo. Selo verde **NOVO** ou **MUDOU** fica 1 hora no card.

## Últimas mudanças
- A cada arquivo novo, o app compara cada `ID` com o anterior e registra: chamado novo; mudança de `STATUS`, `EVOLUCAO`, `DATA_FIM`, `CRITICIDADE` ou `TIPO_FALHA`; dados atualizados; chamado que saiu do arquivo. Mais de 3 sumindo de uma vez vira alerta.
- O registro fica **no aparelho** (últimas 300 mudanças).
- 🔔 liga avisos do aparelho com o app aberto (mesmo em segundo plano). Com o app fechado não há aviso: isso exige um serviço de envio (push).

## Conferência dos dados
- Arquivo sem as colunas obrigatórias, sem tabulação ou sem linhas válidas: o app **não troca** os dados, mantém os últimos válidos e mostra alerta vermelho.
- Linha com `DATA_INICIO` inválida é ignorada; `DATA_FIM` inválida vira "sem fim"; `ID` repetido fica com a linha de atualização mais recente. Os avisos aparecem num alerta amarelo no fim da página, como último item (toque para ver a lista). Erros do arquivo e falha ao guardar continuam em vermelho no topo.
- Se o aparelho não conseguir guardar a cópia, aparece alerta vermelho.
- Sem internet, o app abre com a última cópia guardada.

## Publicar
1. Crie o repositório e suba todos os arquivos na raiz.
2. Ative o GitHub Pages (branch principal, pasta raiz).
3. A cada mudança no app, aumente a versão em `app.js` (`VERSION`), `painel.js` (`VERSAO`) e `sw.js` (`VERSION`), com o mesmo número.
