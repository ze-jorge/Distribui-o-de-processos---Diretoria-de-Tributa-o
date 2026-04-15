import { kv } from '@vercel/kv';

const GRUPOS_SERVIDORES = {
  "Estudos Tributários":["Jeane", "Marcia", "Vanessa", "Cléia"],
  "Processos Fiscais":["Wagner", "Neuma", "Maria", "Viviene"]
};

function getStatusInicial() {
  const status = {};
  [...GRUPOS_SERVIDORES["Estudos Tributários"], ...GRUPOS_SERVIDORES["Processos Fiscais"]].forEach(nome => {
    status[nome] = { status: "Ativo", recessoUsado: 0 };
  });
  return status;
}

// Lógica isolada para encontrar quem é o próximo da fila
async function obterProximoServidor(assunto) {
  let [status, indexEstudos, indexFiscais, indexFiscais_ISS] = await Promise.all([
    kv.get('statusEquipe'),
    kv.get('indexEstudos'),
    kv.get('indexFiscais'),
    kv.get('indexFiscais_ISS')
  ]);

  status = status || getStatusInicial();
  let iEstudos = indexEstudos || 0;
  let iFiscais = indexFiscais || 0;
  let iISS = indexFiscais_ISS || 0;

  let grupo = "", chaveBanco = "", indexAtual = 0;
  const assuntosEstudos =["IPTU Social", "Restituição e Compensação", "PMCMV", "Diversos - Estudos"];
  const assuntosFiscaisGeral =["ITBI incorporação", "Imunidades e isenções", "Decadência", "Pareceres Diversos"];

  if (assuntosEstudos.includes(assunto)) {
    grupo = "Estudos Tributários"; chaveBanco = 'indexEstudos'; indexAtual = iEstudos;
  } else if (assuntosFiscaisGeral.includes(assunto)) {
    grupo = "Processos Fiscais"; chaveBanco = 'indexFiscais'; indexAtual = iFiscais;
  } else if (assunto === "ISS Construção") {
    grupo = "Processos Fiscais (Fila ISS Construção)"; chaveBanco = 'indexFiscais_ISS'; indexAtual = iISS;
  } else {
    throw new Error("Assunto inválido.");
  }

  let listaNomes = grupo.includes("Estudos") ? GRUPOS_SERVIDORES["Estudos Tributários"] : GRUPOS_SERVIDORES["Processos Fiscais"];
  let servidorDesignado = null;

  for (let i = 0; i < listaNomes.length; i++) {
    let nome = listaNomes[indexAtual];
    if (status[nome].status === "Ativo") {
      servidorDesignado = nome;
      await kv.set(chaveBanco, (indexAtual + 1) % listaNomes.length); // Salva a próxima vez
      break;
    }
    indexAtual = (indexAtual + 1) % listaNomes.length;
  }

  if (!servidorDesignado) throw new Error("Todos os servidores deste grupo estão inativos.");
  return { servidor: servidorDesignado, grupo };
}

// Esta é a função principal que escuta as chamadas do site
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use o método POST.' });

  const { action, payload } = req.body;

  try {
    if (action === 'carregar') {
      let [status, historico] = await Promise.all([ kv.get('statusEquipe'), kv.get('historicoProcessos') ]);
      if (!status) { status = getStatusInicial(); await kv.set('statusEquipe', status); }
      return res.status(200).json({ status, historico: historico ||[] });
    }

    if (action === 'distribuir') {
      const { assunto, numeroProcesso, dataHoraEntrada } = payload;
      const { servidor, grupo } = await obterProximoServidor(assunto);

      const novoProcesso = {
        id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
        numero: numeroProcesso, dataHora: dataHoraEntrada, assunto, grupo, servidor
      };

      let historico = await kv.get('historicoProcessos') ||[];
      historico.unshift(novoProcesso);
      if (historico.length > 50) historico.pop(); // Limita a 50 na tela

      await kv.set('historicoProcessos', historico);
      return res.status(200).json({ processoAtual: novoProcesso, historico });
    }

    if (action === 'editar') {
      let historico = await kv.get('historicoProcessos') ||[];
      const index = historico.findIndex(p => p.id === payload.id);
      if (index === -1) throw new Error("Processo não encontrado no histórico.");

      let pAntigo = historico[index];
      let novoAssunto = payload.assunto;
      let novoServidor = pAntigo.servidor;
      let novoGrupo = pAntigo.grupo;

      // Se mudou o assunto, recalcula quem é o novo responsável
      if (novoAssunto !== pAntigo.assunto) {
        const dist = await obterProximoServidor(novoAssunto);
        novoServidor = dist.servidor; novoGrupo = dist.grupo;
      }

      historico[index] = { id: pAntigo.id, numero: payload.numeroProcesso, dataHora: payload.dataHoraEntrada, assunto: novoAssunto, grupo: novoGrupo, servidor: novoServidor };
      await kv.set('historicoProcessos', historico);
      return res.status(200).json({ processoAtual: historico[index], historico });
    }

    if (action === 'excluir') {
      let historico = await kv.get('historicoProcessos') ||[];
      historico = historico.filter(p => p.id !== payload.id);
      await kv.set('historicoProcessos', historico);
      return res.status(200).json(historico);
    }

    if (action === 'status') {
      const { nome, grupo, novoStatus, diasRecesso } = payload;
      let statusObj = await kv.get('statusEquipe') || getStatusInicial();

      if (novoStatus !== "Ativo" && statusObj[nome].status === "Ativo") {
        let inativos = GRUPOS_SERVIDORES[grupo].filter(s => statusObj[s].status !== "Ativo").length;
        if (inativos >= 2) throw new Error(`Já existem 2 servidores do grupo ${grupo} inativos.`);
      }

      if (novoStatus === "Recesso") {
        let dias = parseInt(diasRecesso);
        if (dias > 3) throw new Error("O recesso máximo é de 03 dias seguidos.");
        if (statusObj[nome].recessoUsado + dias > 10) throw new Error("Limite anual de 10 dias excedido.");
        statusObj[nome].recessoUsado += dias;
      }

      statusObj[nome].status = novoStatus;
      await kv.set('statusEquipe', statusObj);
      return res.status(200).json(statusObj);
    }

    return res.status(400).json({ error: "Ação não reconhecida." });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
