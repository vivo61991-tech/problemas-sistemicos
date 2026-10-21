# Problemas Sistêmicos (v1.0.0)

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
- **Usadas na tela:** `CHAMADO, CRITICIDADE, EVOLUCAO, SEGMENTO, IMPACTO_OPERACIONAL, DATA_FIM, TIPO_FALHA, GRUPOS_RESPONSAVEIS, GRUPOS_IMPACTADOS, AREA_ACIONADA, ALERTA_ENVIADO, DATA_ATUALIZACAO, DADO_ATUALIZADO, TEMPO_DECORRIDO`.
- **Coluna nova:** pode entrar em qualquer posição; aparece no detalhe, em "Outras colunas".
- **Datas:** `20/10/26 08:22:00,000000000` (também aceita `20/10/2026 08:22` e `2026-10-20 08:22:00`).

## Em andamento
- Chamado em andamento = `STATUS` ABERTO. Status desconhecido conta como em andamento enquanto não tiver `DATA_FIM`. FECHADO e INDEVIDO nunca contam.
- Ordem: criticidade (P0 primeiro) e, dentro dela, o aberto há mais tempo.
- O tempo "aberto há" corre ao vivo a partir da `DATA_INICIO`.
- Selo **NOVO** ou **MUDOU** fica 1 hora no card.

## Últimas mudanças
- A cada arquivo novo, o app compara cada `ID` com o anterior e registra: chamado novo; mudança de `STATUS`, `EVOLUCAO`, `DATA_FIM`, `CRITICIDADE` ou `TIPO_FALHA`; dados atualizados (só `DATA_ATUALIZACAO` mudou); chamado que saiu do arquivo.
- Se mais de 3 chamados somem de uma vez, vira um único registro e aparece um alerta para conferir se o arquivo veio completo.
- O registro fica **no aparelho** (últimas 300 mudanças) e começa a contar a partir do primeiro acesso.
- 🔔 liga avisos do aparelho: com o app aberto (mesmo em segundo plano), cada mudança gera um aviso. Com o app fechado não há aviso — isso exige um serviço de envio (push), que pode vir junto com o MAPI.

## Indicadores
- **Em andamento**, **abertos hoje** (sem indevidos) e **com falha hoje**: tempo, desde 00h até agora, com pelo menos um chamado ativo (sobreposição conta uma vez, indevido fica fora).

## Conferência dos dados
- Arquivo sem as colunas obrigatórias, sem tabulação ou sem linhas válidas: o app **não troca** os dados, mantém os últimos válidos e mostra alerta vermelho.
- Linha com `DATA_INICIO` inválida é ignorada; `DATA_FIM` inválida vira "sem fim"; `ID` repetido fica com a linha de atualização mais recente. Tudo aparece em "Sobre os dados".
- Se o aparelho não conseguir guardar a cópia, aparece alerta vermelho.
- Sem internet, o app abre com a última cópia guardada.

## Publicar
1. Crie o repositório e suba todos os arquivos na raiz.
2. Ative o GitHub Pages (branch principal, pasta raiz).
3. A cada mudança no app, aumente a versão em `app.js` (`VERSION`) e em `sw.js` (`VERSION`), com o mesmo número.
