import { kv } from '@vercel/kv';

// ================= LISTA DE USUÁRIOS E PERFIS =================
// 'admin': Faz alterações totais.
// 'distribuidor': Visualiza tudo e pode distribuir novos processos (Mas não pode apagar/editar/transferir/marcar férias).
const USUARIOS = {
  "admin": { senha: "admin123", perfil: "admin" },
  "diretor": { senha: "zeprimevo", perfil: "admin" },
  
  // Login genérico para a equipe operar
  "equipe": { senha: "equipe123", perfil: "distribuidor" },
  
  // Logins individuais (Opcional, todos como distribuidores)
  "wagner": { senha: "senha123", perfil: "distribuidor" },
  "jeane": { senha: "senha123", perfil: "distribuidor" },
  "neuma": { senha: "senha123", perfil: "distribuidor" },
  "maria": { senha: "senha123", perfil: "distribuidor" },
  "viviene": { senha: "senha123", perfil: "distribuidor" },
  "marcia": { senha: "senha123", perfil: "distribuidor" },
  "vanessa": { senha: "senha123", perfil: "distribuidor" },
  "cleia": { senha: "senha123", perfil: "distribuidor" },
  "barbarh": { senha: "senha123", perfil: "distribuidor" }
};

const GRUPOS_SERVIDORES = {
  "Estudos Tributários":["Jeane", "Marcia", "Vanessa", "Cléia", "Bárbarh"],
  "Processos Fiscais":["Wagner", "Neuma", "Maria", "Viviene"]
};

// ================= FERIADOS =================
const FERIADOS_PALMAS_FIXOS =["01-01", "03-19", "04-21", "05-01", "05-20", "09-07", "09-08", "10-05", "10-12", "11-02", "11-15", "12-25"];
const FERIADOS_MOVEIS =["2025-03-03", "2025-03-04", "2025-04-18", "2025-06-19", "2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04"];

function isFeriado(dateStr) { return FERIADOS_PALMAS_FIXOS.includes(dateStr.substring(5)) || FERIADOS_MOVEIS.includes(dateStr); }
function calcularDiasUteis(startStr, endStr) {
    let start = new Date(startStr + 'T12:00:00Z'), end = new Date(endStr + 'T12:00:00Z'), count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        let day = d.getUTCDay();
        if (day !== 0 && day !== 6 && !isFeriado(d.toISOString().split('T')[0])) count++;
    }
    return count;
}
function isAtivoHoje(nome, ausencias) {
    const dataHoje = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).split(' ')[0];
    return !ausencias.some(a => a.nome === nome && a.dataInicio <= dataHoje && a.dataFim >= dataHoje);
}

async function obterProximoServidor(assunto, ausencias) {
  let[indexEstudos, indexFiscais, indexFiscais_ISS] = await Promise.all([kv.get('indexEstudos'), kv.get('indexFiscais'), kv.get('indexFiscais_ISS')]);
  let grupo = "", chaveBanco = "", indexAtual = 0;
  const assuntosEstudos =["IPTU Social", "Restituição e Compensação", "PMCMV", "Diversos - Estudos"];
  const assuntosFiscaisGeral =["ITBI incorporação", "Imunidades e isenções", "Decadência", "Pareceres Diversos"];

  if (assuntosEstudos.includes(assunto)) { grupo = "Estudos Tributários"; chaveBanco = 'indexEstudos'; indexAtual = indexEstudos || 0; } 
  else if (assuntosFiscaisGeral.includes(assunto)) { grupo = "Processos Fiscais"; chaveBanco = 'indexFiscais'; indexAtual = indexFiscais || 0; } 
  else if (assunto === "ISS Construção") { grupo = "Processos Fiscais (Fila ISS Construção)"; chaveBanco = 'indexFiscais_ISS'; indexAtual = indexFiscais_ISS || 0; } 
  else throw new Error("Assunto inválido.");

  let listaNomes = grupo.includes("Estudos") ? GRUPOS_SERVIDORES["Estudos Tributários"] : GRUPOS_SERVIDORES["Processos Fiscais"];
  let servidorDesignado = null;

  for (let i = 0; i < listaNomes.length; i++) {
    let nome = listaNomes[indexAtual];
    if (isAtivoHoje(nome, ausencias)) { servidorDesignado = nome; await kv.set(chaveBanco, (indexAtual + 1) % listaNomes.length); break; }
    indexAtual = (indexAtual + 1) % listaNomes.length;
  }
  if (!servidorDesignado) throw new Error(`Todos os servidores do grupo "${grupo}" estão de folga/férias hoje.`);
  return { servidor: servidorDesignado, grupo };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use o método POST.' });
  const { action, payload } = req.body;

  try {
    if (action === 'login') {
      const { usuario, senha } = payload;
      const userKey = (usuario || "").toLowerCase().trim();
      
      if (USUARIOS[userKey] && USUARIOS[userKey].senha === senha) {
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await kv.set(`session_${token}`, userKey, { ex: 86400 });
        return res.status(200).json({ token, usuario: userKey, perfil: USUARIOS[userKey].perfil });
      } else {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }
    }

    if (action === 'logout') {
      if (payload && payload.token) await kv.del(`session_${payload.token}`);
      return res.status(200).json({ success: true });
    }

    // ========== MIDDLEWARE DE SEGURANÇA ==========
    const tokenSessao = payload ? payload.token : null;
    if (!tokenSessao) return res.status(401).json({ error: "Acesso Negado. Faça Login." });
    
    const usuarioLogado = await kv.get(`session_${tokenSessao}`);
    if (!usuarioLogado) return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });

    const perfilUsuario = USUARIOS[usuarioLogado] ? USUARIOS[usuarioLogado].perfil : "distribuidor";
    
    // Agora o distribuidor pode distribuir! Só o resto que é bloqueado.
    const acoesBloqueadasDistribuidor =['editarProcesso', 'transferirProcesso', 'excluirProcesso', 'agendarAusencia', 'excluirAusencia'];
    if (acoesBloqueadasDistribuidor.includes(action) && perfilUsuario !== "admin") {
      return res.status(403).json({ error: "Acesso Restrito: Seu perfil de Distribuidor não possui permissão de Administrador para fazer isto." });
    }

    // ========== AÇÕES DO SISTEMA ==========
    let ausencias = await kv.get('ausencias') ||[];
    
    if (action === 'carregar') {
      let historico = await kv.get('historicoProcessos') ||[];
      return res.status(200).json({ ausencias, historico });
    }

    if (action === 'distribuir') {
      const { assunto, numeroProcesso, dataHoraEntrada } = payload;
      const { servidor, grupo } = await obterProximoServidor(assunto, ausencias);
      const novoProcesso = { 
        id: Date.now().toString(), numero: numeroProcesso, dataHora: dataHoraEntrada, 
        assunto, grupo, servidor, transferido: false, servidorOrigem: "" 
      };
      let historico = await kv.get('historicoProcessos') ||[];
      historico.unshift(novoProcesso);
      if (historico.length > 5000) historico.pop();
      await kv.set('historicoProcessos', historico);
      return res.status(200).json({ processoAtual: novoProcesso, historico });
    }

    if (action === 'editarProcesso') {
      let historico = await kv.get('historicoProcessos') ||[];
      const index = historico.findIndex(p => p.id === payload.id);
      if (index === -1) throw new Error("Processo não encontrado.");
      let pAntigo = historico[index]; let novoAssunto = payload.assunto; let novoGrupo = pAntigo.grupo;
      const assuntosEstudos =["IPTU Social", "Restituição e Compensação", "PMCMV", "Diversos - Estudos"];
      const assuntosFiscaisGeral =["ITBI incorporação", "Imunidades e isenções", "Decadência", "Pareceres Diversos"];
      if (assuntosEstudos.includes(novoAssunto)) novoGrupo = "Estudos Tributários"; else if (assuntosFiscaisGeral.includes(novoAssunto)) novoGrupo = "Processos Fiscais"; else if (novoAssunto === "ISS Construção") novoGrupo = "Processos Fiscais (Fila ISS Construção)";
      historico[index] = { ...pAntigo, numero: payload.numeroProcesso, dataHora: payload.dataHoraEntrada, assunto: novoAssunto, grupo: novoGrupo };
      await kv.set('historicoProcessos', historico);
      return res.status(200).json({ processoAtual: historico[index], historico });
    }

    // AQUI ESTÁ A MUDANÇA DA TRANSFERÊNCIA
    if (action === 'transferirProcesso') {
      let historico = await kv.get('historicoProcessos') ||[];
      const index = historico.findIndex(p => p.id === payload.id);
      if (index === -1) throw new Error("Processo não encontrado.");
      
      // Guarda quem era o servidor antigo e ativa a tag de transferido
      historico[index].servidorOrigem = historico[index].servidor;
      historico[index].transferido = true;
      historico[index].servidor = payload.novoServidor;
      
      await kv.set('historicoProcessos', historico);
      return res.status(200).json({ historico });
    }

    if (action === 'excluirProcesso') {
      let historico = await kv.get('historicoProcessos') ||[];
      const index = historico.findIndex(p => p.id === payload.id);
      if (index !== -1) {
        let pExcluido = historico[index]; let chaveBanco = ""; let listaNomes =[];
        if (pExcluido.grupo === "Estudos Tributários") { chaveBanco = 'indexEstudos'; listaNomes = GRUPOS_SERVIDORES["Estudos Tributários"]; } else if (pExcluido.grupo === "Processos Fiscais") { chaveBanco = 'indexFiscais'; listaNomes = GRUPOS_SERVIDORES["Processos Fiscais"]; } else if (pExcluido.grupo === "Processos Fiscais (Fila ISS Construção)") { chaveBanco = 'indexFiscais_ISS'; listaNomes = GRUPOS_SERVIDORES["Processos Fiscais"]; }
        if (chaveBanco !== "") { const idx = listaNomes.indexOf(pExcluido.servidor); if (idx !== -1) await kv.set(chaveBanco, idx); }
        historico.splice(index, 1); await kv.set('historicoProcessos', historico);
      }
      return res.status(200).json(historico);
    }

    if (action === 'agendarAusencia') {
      const { nome, grupo, tipo, dataInicio, dataFim } = payload;
      if (dataInicio > dataFim) throw new Error("Data inicial maior que a final.");
      const diasUteis = calcularDiasUteis(dataInicio, dataFim);
      if (diasUteis === 0) throw new Error("Período cai inteiramente em fins de semana/feriados.");
      if (tipo === 'Recesso') {
        if (diasUteis > 3) throw new Error("Recesso máximo de 03 dias ÚTEIS seguidos.");
        let recessoJaUsado = ausencias.filter(a => a.nome === nome && a.tipo === 'Recesso' && a.dataInicio.startsWith(dataInicio.substring(0,4))).reduce((acc, a) => acc + calcularDiasUteis(a.dataInicio, a.dataFim), 0);
        
        // LIMITE ALTERADO DE 10 PARA 05 AQUI
        if (recessoJaUsado + diasUteis > 5) throw new Error(`O limite de 05 dias anuais de recesso foi excedido para ${nome}. Restam apenas ${5 - recessoJaUsado} dia(s).`);
      }
      if (ausencias.some(a => a.nome === nome && ((dataInicio >= a.dataInicio && dataInicio <= a.dataFim) || (dataFim >= a.dataInicio && dataFim <= a.dataFim)))) throw new Error("Servidor já possui ausência neste período.");
      for (let d = new Date(dataInicio + 'T12:00:00Z'); d <= new Date(dataFim + 'T12:00:00Z'); d.setDate(d.getDate() + 1)) {
        let dateStr = d.toISOString().split('T')[0];
        if (ausencias.filter(a => a.grupo === grupo && a.dataInicio <= dateStr && a.dataFim >= dateStr).length >= 2) throw new Error(`Conflito: No dia ${dateStr.split('-').reverse().join('/')}, o grupo já possuirá 2 servidores de folga.`);
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

    return res.status(400).json({ error: "Ação não reconhecida." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
