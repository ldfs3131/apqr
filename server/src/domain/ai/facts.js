/**
 * Etapa 1–3 do relatório: dados brutos → métricas → diagnóstico determinístico.
 * O resultado ("fatos") é a ÚNICA coisa que a IA recebe. Não contém nome completo, e-mail, CPF,
 * telefone, endereço nem identificadores internos — só números do método e nomes de matérias/conteúdos.
 */
import { createHash } from 'node:crypto';
import { addDays, today } from '../../lib/util.js';
import * as Stats from '../stats.js';
import { classIndicators } from '../indicators.js';
import { getSettings } from '../settings.js';

const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const hours = (secs) => r1((secs || 0) / 3600);

export async function buildFacts(d, ctx, enrollment) {
  const t = today(enrollment.student_tz);
  const settings = await getSettings(d, enrollment.tenant_id);
  const rows = await Stats.topicRows(d, enrollment, settings);
  const [ind] = await classIndicators(d, { ...ctx, role: 'teacher' }, { studentId: enrollment.student_id, editalId: enrollment.edital_id, today: t, settings });
  const from = addDays(t, -27);
  const period = await Stats.summary(d, enrollment, { from, to: t, rows });
  const subjects = await Stats.subjectBreakdown(d, enrollment, { from, to: t, rows });
  const evaluated = rows.filter((x) => x.last_percent != null);
  const weakest = [...evaluated].filter((x) => x.status !== 'consolidated').sort((a, b) => a.last_percent - b.last_percent).slice(0, 5);
  const strongest = [...evaluated].sort((a, b) => b.last_percent - a.last_percent).slice(0, 3);
  const facts = {
    data_de_referencia: t,
    edital: { nome: enrollment.edital_name, dias_para_prova: enrollment.exam_date ? Math.max(0, Math.round((new Date(enrollment.exam_date) - new Date(t)) / 86400000)) : null },
    regras_vigentes: {
      versao: settings.version,
      minimo_questoes_por_revisao: settings.min_questions_per_review,
      consolida_acima_de_percentual: settings.consolidation_threshold,
      maximo_revisoes_por_ciclo: settings.max_reviews_per_cycle,
    },
    situacao_atual: {
      conteudos_no_edital: rows.length,
      consolidados: ind?.counts.consolidated ?? 0,
      em_revisao: ind?.counts.review ?? 0,
      material_pronto: ind?.counts.production ?? 0,
      em_assimilacao: ind?.counts.assimilation ?? 0,
      nao_iniciados: ind?.counts.not_started ?? 0,
      aguardando_rodizio: ind?.locked ?? 0,
      consolidacao_percentual: ind?.consolidation_pct ?? 0,
    },
    ultimas_4_semanas: {
      horas_estudadas: hours(period.study_seconds),
      dias_ativos: ind?.active_days_28 ?? 0,
      dias_ativos_nas_4_semanas_anteriores: ind?.active_days_prev_28 ?? 0,
      questoes: period.questions,
      acertos: period.correct,
      percentual_acerto: r1(period.accuracy),
      percentual_acerto_4_semanas_anteriores: ind?.accuracy_prev_28 ?? null,
      materiais_produzidos: period.productions,
      constancia: ind?.constancy ?? null,
      evolucao_pontos_percentuais: ind?.evolution_pp ?? null,
      conteudos_consolidados_no_periodo: ind?.consolidated_delta ?? 0,
      dias_desde_ultima_atividade: ind?.days_since_activity ?? null,
    },
    materias: subjects.map((s) => ({
      nome: s.name, conteudos: s.total_topics, consolidados: s.counts.consolidated, horas_4_semanas: hours(s.study_seconds),
      questoes_4_semanas: s.questions, percentual_acerto_4_semanas: r1(s.accuracy), prioridade_plano_global: s.plan_priority,
    })),
    conteudos_com_menor_resultado: weakest.map((x) => ({ materia: x.subject_name, conteudo: x.name, ultimo_percentual: r1(x.last_percent), revisoes_no_ciclo: x.reviews.filter(Boolean).length })),
    conteudos_com_melhor_resultado: strongest.map((x) => ({ materia: x.subject_name, conteudo: x.name, ultimo_percentual: r1(x.last_percent) })),
    diagnosticos: (ind?.diagnostics || []).map((g) => ({ codigo: g.code, severidade: g.severity, titulo: g.title, fatos: g.facts })),
  };
  return { facts, indicators: ind, settings };
}

/** Hash estável dos fatos (cache: mesmos fatos → mesmo relatório, sem nova chamada à IA). */
export function factsHash(facts) {
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}

const br = (n, d = 1) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d });

/**
 * Variáveis que a IA pode citar: {chave} → valor formatado pela plataforma.
 * A IA NUNCA escreve números, datas ou nomes com dígitos: escreve a chave, e o servidor preenche.
 * Valores nulos não viram variável (a IA não tem como citá-los).
 */
export function buildVariables(facts) {
  const v = {};
  const put = (key, value, text, label) => { if (value !== null && value !== undefined && value !== '') v[key] = { value, text, label }; };
  const num = (key, n, label) => put(key, n, n == null ? null : br(n), label);
  const pctv = (key, n, label) => put(key, n, n == null ? null : `${br(n)}%`, label);
  const s = facts.situacao_atual;
  const w = facts.ultimas_4_semanas;
  const r = facts.regras_vigentes;
  put('edital', facts.edital.nome, facts.edital.nome, 'nome do edital');
  num('dias_para_prova', facts.edital.dias_para_prova, 'dias até a prova');
  num('conteudos_no_edital', s.conteudos_no_edital, 'total de conteúdos do edital');
  num('consolidados', s.consolidados, 'conteúdos consolidados');
  num('em_revisao', s.em_revisao, 'conteúdos em revisão (Q + R)');
  num('material_pronto', s.material_pronto, 'conteúdos com material pronto, aguardando revisão');
  num('em_assimilacao', s.em_assimilacao, 'conteúdos em assimilação');
  num('nao_iniciados', s.nao_iniciados, 'conteúdos não iniciados');
  num('aguardando_rodizio', s.aguardando_rodizio, 'conteúdos que atingiram o limite de revisões do ciclo');
  pctv('consolidacao_pct', s.consolidacao_percentual, 'percentual do edital consolidado');
  put('horas_4sem', w.horas_estudadas, w.horas_estudadas == null ? null : `${br(w.horas_estudadas)} horas`, 'horas estudadas nas últimas 4 semanas');
  num('dias_ativos_4sem', w.dias_ativos, 'dias ativos nas últimas 4 semanas');
  num('dias_ativos_4sem_anteriores', w.dias_ativos_nas_4_semanas_anteriores, 'dias ativos nas 4 semanas anteriores');
  num('questoes_4sem', w.questoes, 'questões nas últimas 4 semanas');
  num('acertos_4sem', w.acertos, 'acertos nas últimas 4 semanas');
  pctv('acerto_4sem_pct', w.percentual_acerto, 'percentual de acerto nas últimas 4 semanas');
  pctv('acerto_anterior_pct', w.percentual_acerto_4_semanas_anteriores, 'percentual de acerto nas 4 semanas anteriores');
  num('materiais_4sem', w.materiais_produzidos, 'materiais produzidos nas últimas 4 semanas');
  num('constancia', w.constancia, 'constância (0 a 100)');
  put('evolucao_pp', w.evolucao_pontos_percentuais, w.evolucao_pontos_percentuais == null ? null : `${w.evolucao_pontos_percentuais > 0 ? '+' : ''}${br(w.evolucao_pontos_percentuais)} p.p.`, 'evolução da consolidação em 4 semanas');
  num('consolidados_4sem', w.conteudos_consolidados_no_periodo, 'conteúdos consolidados nas últimas 4 semanas');
  num('dias_sem_atividade', w.dias_desde_ultima_atividade, 'dias desde a última atividade');
  num('regra_min_questoes', r.minimo_questoes_por_revisao, 'mínimo de questões por revisão (regra vigente)');
  pctv('regra_consolidacao_pct', r.consolida_acima_de_percentual, 'consolida acima deste percentual (regra vigente)');
  num('regra_max_revisoes', r.maximo_revisoes_por_ciclo, 'máximo de revisões por ciclo (regra vigente)');
  facts.materias.forEach((m, i) => {
    const k = `materia_${i + 1}`;
    put(k, m.nome, m.nome, `nome da matéria ${i + 1}`);
    num(`${k}_consolidados`, m.consolidados, `consolidados em ${m.nome}`);
    num(`${k}_conteudos`, m.conteudos, `conteúdos de ${m.nome}`);
    put(`${k}_horas`, m.horas_4_semanas, `${br(m.horas_4_semanas)} horas`, `horas em ${m.nome} (4 semanas)`);
    num(`${k}_questoes`, m.questoes_4_semanas, `questões em ${m.nome} (4 semanas)`);
    pctv(`${k}_acerto_pct`, m.percentual_acerto_4_semanas, `acerto em ${m.nome} (4 semanas)`);
  });
  facts.conteudos_com_menor_resultado.forEach((c, i) => {
    put(`conteudo_fraco_${i + 1}`, c.conteudo, `${c.materia} — ${c.conteudo}`, `conteúdo com menor resultado nº ${i + 1}`);
    pctv(`conteudo_fraco_${i + 1}_pct`, c.ultimo_percentual, `último resultado de ${c.conteudo}`);
  });
  facts.conteudos_com_melhor_resultado.forEach((c, i) => {
    put(`conteudo_forte_${i + 1}`, c.conteudo, `${c.materia} — ${c.conteudo}`, `conteúdo com melhor resultado nº ${i + 1}`);
    pctv(`conteudo_forte_${i + 1}_pct`, c.ultimo_percentual, `último resultado de ${c.conteudo}`);
  });
  facts.diagnosticos.forEach((g, i) => put(`diagnostico_${i + 1}`, g.codigo, `${g.titulo}: ${g.fatos.replace(/\.$/, '')}`, `diagnóstico calculado: ${g.titulo} (${g.severidade})`));
  return v;
}
