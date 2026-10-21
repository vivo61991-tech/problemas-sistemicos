# Problemas Sistêmicos (v1.3.0)

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
   - nome do sistema e, à direita, o **ID** da solicitação no sistêmico (cápsula só com borda);
   - o impacto e, numa linha própria, a cápsula do tipo de falha com o nome completo (Indisponibilidade total / parcial, Intermitência, Lentidão);
   - **Chamado:** e **Segmento afetado:**;
   - a **barra do dia**: expediente de hoje das 08h às 20h (traço no meio = 14h), preenchida na cor do tipo de falha com o trecho que o chamado já ocupou hoje, até agora. Chamado que vem de ontem começa a contar às 08h de hoje. Atualiza ao vivo;
   - embaixo, o tempo "aberto há" correndo ao vivo e, à direita, o status (evolução) acima do início. Sem ocorrência, aparece o card verde "Nenhuma ocorrência ativa". Embaixo, os **chamados de hoje** (abertos primeiro, depois os encerrados) e as **últimas mudanças** de status. O número de ocorrências ativas aparece no ícone do menu.
2. **Histórico**: todos os chamados por dia, com busca por texto, filtro por **sistema** e por tipo de falha (ou só indevidos).
3. **Painel**: o mesmo painel do app de NS: Dia / Semana / Mês (botão ou arrastar para o lado), filtro do dia da semana no modo Dia, seleção de coluna (toque no gráfico, na tabela ou no cabeçalho da matriz), cards, gráficos, matriz sistemas × períodos e tabela.

## Como o Painel monta os períodos
O `sistemas.txt` tem uma linha por chamado, então os períodos são montados pelo app:
- **Dia**: os 7 últimos dias (com filtro: as 7 últimas ocorrências daquele dia da semana).
- **Semana**: as 7 últimas semanas, de segunda a domingo.
- **Mês**: os 7 últimos meses do calendário.
- Um chamado conta em todos os períodos em que esteve ativo. O tempo é o trecho dentro do **expediente 08h–20h**; no total, sobreposição conta uma vez e indevido fica fora.
- **% do expediente** = tempo ÷ expediente do período inteiro (dia 12h; semana 7 × 12h; mês dias × 12h).
- Período em andamento leva `*` e não tem variação (ainda vai crescer). Período antes do 1º chamado do arquivo fica listrado ("sem dados").
- Variação: ▲ rosa = piorou, ▼ verde = melhorou.

## Cores
- Falha sempre em tons de vermelho a amarelo (rosa e laranja da empresa): Indisp. total `#D61F4F`, Indisp. parcial `#F2603E`, Intermitência `#FF9901`, Lentidão `#FFC629`. Total de todos os sistemas: rosa escuro `#B4245E`.
- **Verde** só para "sem ocorrência" (card do topo, dia sem chamado, melhora).
- Chamado encerrado e indevido: neutro (cinza-lilás).

## Em andamento
- Chamado em andamento = `STATUS` ABERTO. Status desconhecido conta como em andamento enquanto não tiver `DATA_FIM`. FECHADO e INDEVIDO nunca contam.
- Ordem: criticidade (P0 primeiro) e, dentro dela, o aberto há mais tempo. Selo **NOVO** ou **MUDOU** fica 1 hora no card.

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
