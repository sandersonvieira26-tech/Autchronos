// === REALTIME SUPABASE ===
// Reloads parciais — cada handler busca só a tabela que mudou
async function _rtMateriais() {
  const { data, error } = await _sb.from('materiais').select('*').order('id');
  if (!error) _materiais = data.map(normMaterial);
  renderCards(); renderMaterialsTable(); renderAlertas();
  renderDaySummary(); updateReposicaoBadge(); updateTabIndicators();
}
async function _rtMovimentacoes() {
  const { data, error } = await _sb.from('movimentacoes').select('*').order('data', { ascending: false }).limit(2000);
  if (!error) _movimentacoes = data.map(normMovimento);
  renderMovements(); renderDaySummary();
}
async function _rtEquipamentos() {
  const { data, error } = await _sb.from('equipamentos_calibracao').select('*').order('data_proxima_calibracao');
  if (!error) _equipamentos = data.map(normEquipamento);
  renderEquipamentos(); renderDaySummary(); updateTabIndicators();
}
async function _rtColaboradores() {
  const { data, error } = await _sb.from('colaboradores').select('id, nome, cpf, setor, created_at').order('nome');
  if (!error) _colaboradores = data.map(normColaborador);
  renderCautela();
}
async function _rtFerramentas() {
  const { data, error } = await _sb.from('ferramentas_cautela').select('*').order('nome');
  if (!error) _ferramentas_cautela = data.map(normFerramentaCautela);
  renderCautela(); updateTabIndicators();
}
async function _rtCautelas() {
  const { data, error } = await _sb.from('cautelas').select('*').order('data_retirada', { ascending: false });
  if (!error) _cautelas = data.map(normCautela);
  renderCautela(); renderDaySummary(); updateTabIndicators();
}

function setupRealtime() {
  if (_realtimeChannel) { _sb.removeChannel(_realtimeChannel); _realtimeChannel = null; }
  _realtimeChannel = _sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'materiais' },              () => _rtMateriais())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes' },           () => _rtMovimentacoes())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipamentos_calibracao' }, () => _rtEquipamentos())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' },           () => _rtColaboradores())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ferramentas_cautela' },     () => _rtFerramentas())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cautelas' },               () => _rtCautelas())
    .subscribe();
}
