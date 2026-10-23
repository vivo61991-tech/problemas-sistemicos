# Problemas Sistêmicos (v1.28.0)

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

1. **Ocorrências**: sem nenhum chamado em andamento, o card verde mostra o ícone de check e, ao lado, "Nenhuma ocorrência ativa" e "Todos os sistemas operando.", centralizados na vertical; embaixo, num rodapé discreto (tudo verde), "Último normalizado:" e, em letra menor, o ID numa cápsula só com borda, o sistema e a hora ("312 PORTAL INTEGRA - LEGADO · hoje às 09:05"). Com chamado em andamento, no topo, um card grande para cada chamado em andamento, claro e "flutuando" sobre o fundo (sombra suave, cantos de 20px); a cor do tipo de falha fica na cápsula do tipo e na barra do dia:
   - nome do sistema numa linha só (nome grande termina em "…") e, à direita, o **ID** da solicitação no sistêmico (cápsula só com borda);
   - o impacto (até 2 linhas; o texto completo fica no detalhe) e a cápsula do tipo de falha por extenso seguida dos segmentos: "Indisponibilidade parcial **para B2B e B2C**";
   - o número do chamado não aparece no card, só no detalhe (toque no card);
   - selo verde **NOVO** (ou **ALTERAÇÕES**) metade dentro e metade fora do card, no canto inferior esquerdo, por 1 hora. **Tocar no selo** abre uma janela só com a **mudança mais recente** desse chamado (a que o selo anuncia), em vez do detalhe;
   - o tempo "aberto há" correndo ao vivo e, à direita, o status (evolução) acima do início;
   - **cronômetro** (ícone à esquerda do tempo "aberto há"): abre uma janela com o tempo decorrido **correndo a cada segundo**, em horas acumuladas (ex.: `74:12:05`, sem virar dias), desde quando abriu, e embaixo a **análise do histórico** do mesmo sistema com o mesmo tipo de falha (tempo médio, maior e menor tempo, frequência), igual à do detalhe;
   - **alerta enviado** (`ALERTA_ENVIADO` = 1): uma **sirene branca num círculo vermelho** na quina superior direita do card (parte dentro, parte fora, sem cobrir o ID). Tocar nela abre uma janela informativa (com a própria sirene no círculo vermelho): o alerta foi enviado para **reforçar a solicitação com a área responsável**. Fecha no botão **Fechar** (embaixo, centralizado), tocando fora, no Esc ou no voltar do celular; não abre o detalhe do chamado;
   - **alfinete** à esquerda do ID para **fixar** o card no topo. Desligado fica cinza e inclinado; ligado fica roxo, cheio e em pé, e o card ganha um contorno lilás. Dá para fixar vários: o último fixado vai para o topo e os anteriores descem uma posição. Desafixado, o card volta para a ordem normal. Fica guardado **no aparelho** (cada pessoa fixa os seus);
   - por último, a **barra do dia**: expediente de hoje das 08h às 21h (traço = 14h), preenchida na cor do tipo de falha com o trecho que o chamado já ocupou hoje, até agora. Chamado que vem de ontem começa a contar às 08h de hoje. Atualiza ao vivo. Sem ocorrência, aparece o card verde "Nenhuma ocorrência ativa". Embaixo, os **chamados de hoje** (abertos primeiro, depois os encerrados) e as **últimas mudanças** de status. O número de ocorrências ativas aparece no ícone do menu.
   - **compartilhar o chamado**: no detalhe, um ícone pequeno no **canto superior direito** (não muda o layout; a seta de fechar continua sozinha no centro). Abre o compartilhamento do aparelho (WhatsApp, Teams, Outlook…) com o texto do chamado: título `*SISTEMA*` (negrito no WhatsApp), "tipo de falha · status · ID" e a lista Chamado, Início, Fim, Duração, No expediente, Segmento, Área acionada, Grupos responsáveis, Grupos impactados, Evolução, Impacto e Alerta enviado (sem mudanças registradas e sem análise do histórico). Onde o aparelho não tem compartilhamento (ex.: alguns computadores), o texto é **copiado** para colar;
   - **detalhe do chamado** (toque no card): no alto, centralizada, uma **seta para baixo** que fecha o detalhe (não há mais ✕); o **nome do sistema** alinhado à esquerda (quebra linha se for grande) e o **ID** em cápsula só com borda na ponta direita; na linha de baixo, a cápsula do **tipo de falha** na cor dele à esquerda e o **status** na ponta direita (sem a criticidade); depois as caixas **Chamado | Duração** e **Início | Fim** (tocar no chamado copia o número para a área de transferência e aparece "Chamado … copiado"), tudo do chamado (na lista de campos: Segmento, No expediente, Área acionada, Grupos responsáveis, Grupos impactados, **Evolução**, **Impacto** e Alerta enviado) e, no fim, a **Análise do histórico** do mesmo sistema com o mesmo tipo de falha, usando a base inteira (6 meses fechados + mês atual): **tempo médio**, **maior** e **menor** tempo (início → fim dos chamados encerrados, indevidos fora), se o chamado aberto está dentro ou acima da média, e a **frequência** ("ocorre em média a cada 9 dias" = dias da base ÷ ocorrências, contando desde o 1º dia do mês mais antigo do arquivo).
   - **botão de compartilhar** (círculo roxo no canto inferior direito, só na página Ocorrências), com duas opções:
     - **Compartilhar painel**: gera uma **imagem** das ocorrências ativas (mesma ordem da tela, com fixados e sirenes; sem ocorrência, o card verde) com data e hora, e manda junto o **link do app**. Onde o aparelho não envia imagem (alguns computadores), mostra a imagem com **Baixar imagem** e **Copiar link**;
     - **Compartilhar app**: mostra o **QR Code** (`icons/qrcode.svg`), o link `https://vivo61991-tech.github.io/problemas-sistemicos/`, **Copiar link** e atalhos para **WhatsApp**, **Teams** e **Outlook** (e-mail), além de "Outras opções" (compartilhamento do aparelho), quando houver.
2. **Histórico**: todos os chamados por dia. Ao entrar mostra o **mês atual e o anterior**; no fim da lista, o botão **"Mostrar mês de Agosto"** traz o mês seguinte para trás que tiver chamado (depois "Julho", …; de outro ano aparece "Dezembro de 2025"). Mudar busca, filtro ou sistema volta para os 2 meses. Com:
   - em **todas as listas** (Chamados de hoje, Últimas mudanças, Histórico e listas do Painel) o **ID** aparece numa cápsula só com borda, à esquerda do nome do sistema;
   - nas listas de chamados (Chamados de hoje, Histórico e listas do Painel) o fundo é sempre claro; a **barra da esquerda** fica na **cor forte do tipo de falha** quando o chamado está aberto e **roxo bem claro** quando está fechado (indevido: listrado no mesmo roxo); o tipo de falha aparece **por extenso** numa cápsula **discreta** (a cor do tipo bem clara, letra escura; as cores fortes ficam só nos cards), todas com a **mesma largura** e texto centralizado; a linha mostra só o **horário de início** (com a data quando não é do dia da lista); o fim e o número do chamado ficam no detalhe;
   - **busca** por texto (campo com lupa);
   - **filtro de sistema** numa lista própria do app (não a do navegador): nome à esquerda e quantidade de ocorrências (sem indevidos) numa cápsula lilás à direita. Com um sistema escolhido, a caixa mostra o nome, a quantidade e um **✕ à esquerda** para remover o filtro na hora;
   - filtro por tipo de falha (ou só indevidos).
3. **Painel**: o mesmo painel do app de NS: Dia / Semana / Mês (botão ou arrastar para o lado), filtro do dia da semana no modo Dia, seleção de coluna (toque no gráfico, na tabela ou no cabeçalho da matriz) e:
   - **cards sem comparação** com o período anterior. Sem nada selecionado, mostram o **acumulado dos 7 períodos da tela**: chamados distintos ("em 7 dias"), tempo com falha somado e o **% do expediente**, sistemas afetados e o **Período** ("14/10 a 20/10") com as **horas de expediente** somadas (dias fechados = 13h cada; o dia em andamento conta só as horas que já passaram). Com uma coluna selecionada, os mesmos cards mostram só aquele período;
   - gráfico **Tempo com falha no expediente** (o gráfico "Chamados por dia" saiu): o **fundo lilás claro** é o expediente de cada coluna (100% = expediente inteiro, todas as colunas fechadas alinhadas na mesma altura; no período em andamento o fundo sobe conforme as horas passam) e o **preenchimento** é o tempo afetado, na mesma escala;
   - matriz **Sistemas × períodos** (sempre começa **fechada**, mostrando só Total e Chamados; abre na seta; volta a fechar ao sair e voltar para o Painel), com a linha **Chamados** embaixo do Total: quantidade de chamados de todos os sistemas (sem indevidos) em cada coluna e, à direita, os chamados distintos da tela inteira. Tocar no número abre a lista;
   - tabela com **CHAM.** (em cápsula), **TEMPO TOTAL** (tempo com falha no período em qualquer horário), **NO EXPED.** (a parte dentro de 08h–21h) e **% EXPED.** (com barrinha na mesma escala do gráfico), tudo centralizado; a 1ª coluna mostra a data em destaque e o dia da semana embaixo; o domingo aparece em vermelho, como no gráfico.

## Notificações (`notificacao.txt`)
- Arquivo **opcional** na raiz do repositório, ao lado do `sistemas.txt`, conferido junto com ele (a cada 1 minuto). Sem o arquivo, nada aparece e os chamados seguem normais.
- Formato (gerado pelo editor de notificações): UTF-8, tabulação, cabeçalho na 1ª linha, **1 notificação por linha**. Colunas `ID, TIPO, TITULO, TEXTO, DATA_INICIO, DATA_FIM, OBRIGATORIO, STATUS, DATA_ATUALIZACAO`. No TEXTO, quebra de linha = `\n`; marcações `{b} {i} {s} {m} {roxo} {verde} {laranja} {pink} {link=…}…{/link}`.
- **Vale só STATUS = ATIVO e dentro das datas** (relógio do aparelho, reavaliado a cada poucos segundos, sem precisar de arquivo novo): início e fim → só entre os dois; só início → a partir dele, sem prazo; só fim → já vale, até o fim; sem datas → vale enquanto estiver ativa.
- **Ícone (balão de mensagem)** à esquerda do 🔔, só quando há notificação valendo, com o **número de não lidas** (na cor do tipo mais grave entre elas).
- Tocar no ícone: com **uma** notificação abre direto; com **mais de uma** abre a **lista** (ícone + título; não lida com bolinha cheia, lida com bolinha vazada; texto e ícone ficam iguais nas duas). As **não lidas ficam sempre no topo** e as lidas descem na hora (ao voltar para a lista pelo botão ‹ redondo, ao lado do ✕); dentro de cada grupo vale a ordem abaixo. Cada notificação mostra só o **ícone do tipo**, o **título** e o **texto formatado**, com ✕ para fechar.
- Ordem: Crítico, Aviso, Informação, Interrogação; dentro do tipo, a mais recente primeiro.
- Na lista, ícone e título pequenos, em letra normal; o título "Notificações" e o ✕ ficam sempre no topo e só a lista rola. Dentro da notificação, os botões ficam **embaixo**, centralizados e com a mesma largura: "‹ Voltar" (quando veio da lista) e "✕ Fechar"; nas obrigatórias, o **Ciente** fica logo acima deles.
- Ícones (estilo MsgBox do VBA): Crítico ✕ no círculo vermelho; Aviso ! no triângulo amarelo; Interrogação ? no círculo roxo; Informação ! no círculo verde.
- **Obrigatória** (OBRIGATORIO = S): abre sozinha ao entrar no app (e quando chega uma nova), **uma de cada vez, na ordem do ID**: fechou uma (Ciente ou ✕), abre a próxima. Só deixa de contar com o botão **Ciente**, e depois disso não abre mais sozinha (a pessoa pode reabrir pela lista). Fechada só no ✕, volta a abrir na próxima vez que o app for aberto.
- Lida = aberta (não obrigatória) ou com Ciente (obrigatória). Fica guardado **no aparelho**. Se a notificação for editada (DATA_ATUALIZACAO nova), volta a ser não lida.
- **Homologação:** a raiz já traz um `notificacao.txt` de teste com 12 notificações (3 de cada tipo: Crítico, Aviso, Informação e Interrogação; IDs 1, 2 e 4 obrigatórios), com datas a partir de 20/10/2026 e todas as formatações. Trocar pelo arquivo real antes de ir para produção.
- Pasta `ferramentas/` (o app não lê): `editor-notificacoes.html` para abrir, criar, formatar e exportar o arquivo, e `notificacao-exemplo.txt`. Para publicar, o arquivo vai para a **raiz** com o nome `notificacao.txt`.
- Linha com data inválida, fim antes do início ou ID repetido: avisada no alerta amarelo do fim da página. Arquivo com erro: o app mantém as últimas notificações válidas.

## Como o Painel monta os períodos
O `sistemas.txt` tem uma linha por chamado, então os períodos são montados pelo app:
- **Dia**: os 7 últimos dias (com filtro: as 7 últimas ocorrências daquele dia da semana).
- **Semana**: as 7 últimas semanas, de segunda a domingo.
- **Mês**: os 7 últimos meses do calendário.
- Um chamado conta em todos os períodos em que esteve ativo. O tempo é o trecho dentro do **expediente 08h–21h**; no total, sobreposição conta uma vez e indevido fica fora.
- **% do expediente** = tempo com falha ÷ expediente (dia 13h; semana 7 × 13h; mês dias × 13h). No período em andamento, só as horas de expediente que já passaram.
- Período em andamento leva `*` (ainda vai crescer). Período antes do 1º chamado do arquivo fica listrado ("sem dados").

## Cores
- Falha sempre em tons de vermelho a amarelo (rosa e laranja da empresa): Indisp. total `#D61F4F`, Indisp. parcial `#F2603E`, Intermitência `#FF9901`, Lentidão `#FFC629`. Total de todos os sistemas: rosa escuro `#B4245E`.
- **Verde** para "sem ocorrência" (card do topo, dia sem chamado) e para o selo de card novo.
- Chamado encerrado e indevido: neutro (cinza-lilás).
- **Visual (v1.18):** fundo da página em degradê lilás bem suave, fixo; cards, listas e caixas brancos com sombra suave, sem borda (no escuro, roxo-escuro com sombra mais forte). Menu de baixo sem linha de divisão, no tom do fundo; o ícone da página atual fica **preenchido** em roxo. Botões do topo em vidro translúcido. A bolinha do "Ao vivo" continua como antes.

## Em andamento
- Chamado em andamento = `STATUS` ABERTO. Status desconhecido conta como em andamento enquanto não tiver `DATA_FIM`. FECHADO e INDEVIDO nunca contam.
- Ordem: criticidade (P0 primeiro) e, dentro dela, o aberto há mais tempo. Selo verde **NOVO** ou **ALTERAÇÕES** fica 1 hora no card.

## Últimas mudanças
- Funciona como um **log** discreto, para não concorrer com os chamados: hora (e data, se for de outro dia) à esquerda; em letra pequena o ID e o sistema; embaixo, em letra menor ainda, **uma linha com marcador para cada campo que mudou**: "• **Evolução:** Realizando restart", "• **Status:** Fechado", "• **Fim:** 22/10 12:40" (só o valor que entrou, sem o anterior). Chamado novo: "• **Novo chamado**", "• **Status:** Aberto". O número do chamado não aparece no log.
- A cada arquivo novo, o app compara cada `ID` com o anterior e registra: chamado novo; mudança em **qualquer campo** do chamado (sistema, chamado, status, criticidade, evolução, segmento, impacto, início, fim, tipo de falha, grupos responsáveis, grupos impactados, área acionada e alerta enviado; só ficam de fora os campos de controle `DATA_ATUALIZACAO`, `DADO_ATUALIZADO`, `TEMPO_DECORRIDO` e `FLAG`); dados atualizados; chamado que saiu do arquivo. Mais de 3 sumindo de uma vez vira alerta.
- O registro fica **no aparelho** (últimas 300 mudanças).
- 🔔 liga avisos do aparelho com o app aberto (mesmo em segundo plano). Com o app fechado não há aviso: isso exige um serviço de envio (push).

## Conferência dos dados
- Arquivo sem as colunas obrigatórias, sem tabulação ou sem linhas válidas: o app **não troca** os dados, mantém os últimos válidos e mostra alerta vermelho.
- Linha com `DATA_INICIO` inválida é ignorada; `DATA_FIM` inválida vira "sem fim"; `ID` repetido fica com a linha de atualização mais recente. Os avisos aparecem num alerta amarelo no fim da página, como último item (toque para ver a lista). Erros do arquivo e falha ao guardar continuam em vermelho no topo.
- Se o aparelho não conseguir guardar a cópia, aparece alerta vermelho.
- Sem internet, o app abre com a última cópia guardada.

## Dados fictícios (homologação)
- Enquanto a base não é atualizada, o `sistemas.txt` da raiz traz a base real **sem alteração** e, por cima, chamados **fictícios** a partir do ID 312 (todos com "(fictício)" no fim do `IMPACTO_OPERACIONAL`), até 23/10/2026 02:11: 6 em andamento (311 real + 322, 323, 325, 326 e 327), 3 deles com alerta enviado (322, 323 e 326). Trocar pelo arquivo real antes de ir para produção.

## Publicar
1. Crie o repositório e suba todos os arquivos na raiz.
2. Ative o GitHub Pages (branch principal, pasta raiz).
3. A cada mudança no app, aumente a versão em `app.js` (`VERSION`), `painel.js` (`VERSAO`), `notif.js` (`VERSAO`) e `sw.js` (`VERSION`), com o mesmo número.
