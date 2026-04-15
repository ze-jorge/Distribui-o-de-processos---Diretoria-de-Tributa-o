import { kv } from '@vercel/kv';

const GRUPOS_SERVIDORES = {
  "Estudos Tributários":["Jeane", "Marcia", "Vanessa", "Cléia"],
  "Processos Fiscais":["Wagner", "Neuma", "Maria", "Viviene"]
};

// ================= FERIADOS (PALMAS, TO E NACIONAIS) =================
// Feriados fixos anuais (Mês-Dia)
const FERIADOS_PALMAS_FIXOS =["01-01", "03-19", "04-21", "05-01", "05-20", "09-07", "09-08", "10-05", "10-12", "11-02", "11-15", "12-25"];
// Feriados Móveis (Carnaval, Paixão de Cristo, Corpus Christi - 2025/2026)
const FERIADOS_MOVEIS =["2025-03-03", "2025-03-04", "2025-04-18", "2025-06-19", "2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04"];

function isFeriado(dateStr) {
  const mmdd = dateStr.substring(5);
  return FERIADOS_PALMAS_FIXOS.includes(mmdd) || FERIADOS_MOVEIS.includes(dateStr);
}

// ================= LÓGICA DE DIAS ÚTEIS E STATUS =================
function calcularDiasUteis(startStr, endStr) {
    let start = new Date(startStr + 'T12:00:00Z');
    let end = new Date(endStr + 'T12:00:00Z');
    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        let day = d.getUTCDay();
        if (day !== 0 && day !== 6) { // Pula Sábados(6) e Domingos(0)
            let ds = d.toISOString().split('T')[0];
            if (!isFeriado(ds)) count++; // Pula Feriados
        }
    }
    return count;
}

function isAtivoHoje(nome, ausencias) {
    const dataHoje = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).split(' ')[0];
    const emAusencia = ausencias.some(a => a.nome === nome && a.dataInicio <= dataHoje && a.dataFim >= dataHoje);
    return !emAusencia;
}

// ================= DISTRIBUIÇÃO INTELIGENTE =================
async function obterProximoServidor(assunto, ausencias) {
  let [indexEstudos, indexFiscais, indexFiscais_ISS] = await Promise.all([
    kv.get('indexEstudos'), kv.get('indexFiscais'), kv.get('indexFiscais_ISS')
  ]);

  let grupo = "", chaveBanco = "", indexAtual = 0;
  const assuntosEstudos =["IPTU Social", "Restituição e Compensação", "PMCMV", "Diversos - Estudos"];
  const assuntosFiscaisGeral =["ITBI incorporação", "Imunidades e isenções", "Decadência", "Pareceres Diversos"];

  if (assuntosEstudos.includes(assunto)) {
    grupo = "Estudos Tributários"; chaveBanco = 'indexEstudos'; indexAtual = indexEstudos || 0;
  } else if (assuntosFiscaisGeral.includes(assunto)) {
    grupo = "Processos Fiscais"; chaveBanco = 'indexFiscais'; indexAtual = indexFiscais || 0;
  } else if (assunto === "ISS Construção") {
    grupo = "Processos Fiscais (Fila ISS Construção)"; chaveBanco = 'indexFiscais_ISS'; indexAtual = indexFiscais_ISS || 0;
  } else {
    throw new Error("Assunto inválido.");
  }

  let listaNomes = grupo.includes("Estudos") ? GRUPOS_SERVIDORES["Estudos Tributários"] : GRUPOS_SERVIDORES["Processos Fiscais"];
  let servidorDesignado = null;

  for (let i = 0; i < listaNomes.length; i++) {
    let nome = listaNomes[indexAtual];
    
    // Verifica se o servidor NÃO está no período de férias/folga hoje!
    if (isAtivoHoje(nome, ausencias)) {
      servidorDesignado = nome;
      await kv.set(chaveBanco, (indexAtual + 1) % listaNomes.length);
      break;
    }
    indexAtual = (indexAtual + 1) % listaNomes.length;
  }

  if (!servidorDesignado) throw new Error(`Todos os servidores do grupo "${grupo}" estão de folga/férias hoje.`);
  return { servidor: servidorDesignado, grupo };
}

// ================= MOTOR DA API =================
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use o método POST.' });
  const { action, payload } = req.body;

  try {
    let ausencias = await kv.get('ausencias') ||[];
    
    if (action === 'carregar') {
      let historico = await kv.get('historicoProcessos') ||[];
      return res.status(200).json({ ausencias, historico });
    }

    if (action === 'distribuir') {
      const { assunto, numeroProcesso, dataHoraEntrada } = payload;
      const { servidor, grupo } = await obterProximoServidor(assunto, ausencias);

      const novoProcesso = {
        id: Date.now().toString(),
        numero: numeroProcesso, dataHora: dataHoraEntrada, assunto, grupo, servidor
      };

      let historico = await kv.get('historicoProcessos') ||[];
      historico.unshift(novoProcesso);
      if (historico.length > 50) historico.pop();

      await kv.set('historicoProcessos', historico);
      return res.status(200).json({ processoAtual: novoProcesso, historico });
    }

    if (action === 'agendarAusencia') {
      const { nome, grupo, tipo, dataInicio, dataFim } = payload;
      
      if (dataInicio > dataFim) throw new Error("A data inicial não pode ser maior que a final.");
      
      const diasUteis = calcularDiasUteis(dataInicio, dataFim);
      if (diasUteis === 0) throw new Error("O período selecionado cai inteiramente em finais de semana ou feriados (Nenhum dia útil computado).");

      // Regra dos Recessos
      if (tipo === 'Recesso') {
        if (diasUteis > 3) throw new Error("Atenção: O recesso não pode ser superior a 03 dias ÚTEIS seguidos.");
        
        const anoAtual = dataInicio.substring(0, 4);
        let recessoJaUsado = ausencias
          .filter(a => a.nome === nome && a.tipo === 'Recesso' && a.dataInicio.startsWith(anoAtual))
          .reduce((acc, a) => acc + calcularDiasUteis(a.dataInicio, a.dataFim), 0);
          
        if (recessoJaUsado + diasUteis > 10) throw new Error(`Limite anual de 10 dias excedido. Restam apenas ${10 - recessoJaUsado} dia(s) para ${nome}.`);
      }

      // Regra de Conflito de Marcação Dupla
      const temConflitoData = ausencias.some(a => a.nome === nome && ((dataInicio >= a.dataInicio && dataInicio <= a.dataFim) || (dataFim >= a.dataInicio && dataFim <= a.dataFim)));
      if (temConflitoData) throw new Error("O servidor já possui uma ausência marcada conflitando com este período.");

      // Regra de Máximo de 2 servidores por grupo
      for (let d = new Date(dataInicio + 'T12:00:00Z'); d <= new Date(dataFim + 'T12:00:00Z'); d.setDate(d.getDate() + 1)) {
        let dateStr = d.toISOString().split('T')[0];
        let inativosNoDia = ausencias.filter(a => a.grupo === grupo && a.dataInicio <= dateStr && a.dataFim >= dateStr).length;
        if (inativosNoDia >= 2) throw new Error(`Conflito: No dia ${dateStr.split('-').reverse().join('/')}, o grupo '${grupo}' já possuirá 2 servidores de folga. Distribuição prejudicada.`);
      }

      ausencias.push({ id: Date.now().toString(), nome, grupo, tipo, dataInicio, dataFim });
      await kv.set('ausencias', ausencias);
      return res.status(200).json(ausencias);
    }

    if (action === 'excluirAusencia') {
      ausencias = ausencias.filter(a => a.id !== payload.id);
      await kv.set('ausencias', ausencias);
      return res.status(200).json(ausencias);
    }

    // Excluir ou Editar Processos foram omitidos aqui por brevidade, mas você pode usar o mesmo bloco de edição do código anterior!
    if (action === 'excluirProcesso') {
      let historico = await kv.get('historicoProcessos') ||[];
      historico = historico.filter(p => p.id !== payload.id);
      await kv.set('historicoProcessos', historico);
      return res.status(200).json(historico);
    }

    return res.status(400).json({ error: "Ação não reconhecida." });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
