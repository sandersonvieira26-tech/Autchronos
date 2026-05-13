// === CONFIRMAR EXCLUSÃO ===
let _confirmDelCallback = null;
function openConfirmDelete(title, msg, onConfirm) {
  _confirmDelCallback = onConfirm;
  document.getElementById('confirm-del-title').textContent = title;
  document.getElementById('confirm-del-msg').innerHTML = msg;
  const btn = document.getElementById('confirm-del-btn');
  btn.onclick = () => { const cb = _confirmDelCallback; closeConfirmDelete(); if (cb) cb(); };
  document.getElementById('modal-confirm-del').style.display = 'flex';
}

function closeConfirmDelete() {
  document.getElementById('modal-confirm-del').style.display = 'none';
  _confirmDelCallback = null;
}

// === GERENCIAR USUÁRIOS ===
function openUsuariosModal() {
  if (!guardAdmin()) return;
  document.getElementById('modal-usuarios').style.display = 'flex';
  renderUserList();
}
function closeUsuariosModal() {
  document.getElementById('modal-usuarios').style.display = 'none';
}
function renderUserList() {
  const users = getUsuarios();
  const adminCount = users.filter(u => u.papel === 'admin').length;
  document.getElementById('usuarios-tbody').innerHTML = users.map(u => {
    const isSelf = u.id === currentSession.usuarioId;
    const isAdmin = u.papel === 'admin';
    const roleCls = isAdmin ? 'badge-entrada' : 'badge-saida';
    const roleLabel = isAdmin ? 'Admin' : 'Viewer';
    const isLastAdmin = isAdmin && adminCount === 1;

    let roleBtn = '';
    let delBtn  = '';
    if (isSelf) {
      roleBtn = `<span style="font-size:0.8125rem;color:var(--gray-600)">— você mesmo</span>`;
    } else if (isLastAdmin) {
      roleBtn = `<span style="font-size:0.8125rem;color:var(--gray-600)" title="É o único admin">Único admin</span>`;
    } else {
      const label = isAdmin ? 'Rebaixar' : 'Tornar Admin';
      const cls   = isAdmin ? 'btn-danger' : 'btn-primary';
      roleBtn = `<button class="btn ${cls} btn-sm" onclick="changeUserRole('${u.id}')">${label}</button>`;
      delBtn  = `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Excluir</button>`;
    }

    return `<tr>
      <td>${esc(u.nomeCompleto)}</td>
      <td><span class="badge ${roleCls}">${roleLabel}</span></td>
      <td style="display:flex;gap:0.375rem;flex-wrap:wrap">${roleBtn}${delBtn}</td>
    </tr>`;
  }).join('');
}

async function deleteUser(id) {
  const user = getUsuarios().find(u => u.id === id);
  if (!user) return;
  openConfirmDelete(
    'Excluir usuário',
    `Tem certeza que deseja excluir <span class="confirm-del-name">${esc(user.nomeCompleto)}</span>? O acesso ao sistema será bloqueado imediatamente.`,
    async () => {
      const { error } = await _sb.rpc('admin_delete_user', { target_user_id: id });
      if (error) { alert('Erro ao excluir usuário: ' + error.message); return; }
      await loadAllData();
      renderUserList();
      showToast('Usuário excluído.');
    }
  );
}

async function changeUserRole(id) {
  const user = getUsuarios().find(u => u.id === id);
  if (!user) return;

  const novoPapel = user.papel === 'admin' ? 'viewer' : 'admin';
  const acao = novoPapel === 'admin' ? 'tornar Admin' : 'rebaixar para Viewer';
  if (!confirm(`Deseja ${acao} o usuário "${user.nomeCompleto}"?`)) return;

  const { error } = await _sb.from('profiles').update({ papel: novoPapel }).eq('id', id);
  if (error) {
    alert('Erro ao alterar papel.\n\nSe a alteração falhou por permissão, rode o SQL de correção de RLS no Supabase (veja instruções).\n\nDetalhe: ' + error.message);
    return;
  }
  await loadAllData();
  renderUserList();
}

// === BACKUP E RESTAURAÇÃO ===
async function exportBackup() {
  const { data: calibHist } = await _sb.from('calibracoes_historico').select('*').order('data_calibracao');
  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),
    categorias: getCategorias(),
    materiais: getMateriais(),
    movimentacoes: getMovimentacoes(),
    colaboradores: getColaboradores(),
    ferramentas: getFerramentasCautela(),
    cautelas: getCautelas(),
    equipamentos: getEquipamentos(),
    calibracoesHistorico: calibHist || []
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autchronos_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.materiais || !data.categorias)
        return alert('Arquivo inválido. Selecione um backup gerado por este sistema.');
      const ver = data.version || 2;
      if (!confirm('Restaurar backup apagará TODOS os dados atuais do banco. Esta operação não pode ser desfeita. Continuar?')) return;

      const mustDel = async (table, q) => {
        const { error } = await q;
        if (error) throw new Error(`Falha ao limpar ${table}: ${error.message}`);
      };

      // Delete in FK-safe order (dependents first)
      if (ver >= 3) {
        await mustDel('cautelas', _sb.from('cautelas').delete().not('id', 'is', null));
        await mustDel('calibracoes_historico', _sb.from('calibracoes_historico').delete().not('id', 'is', null));
        await mustDel('movimentacoes', _sb.from('movimentacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        await mustDel('ferramentas_cautela', _sb.from('ferramentas_cautela').delete().not('id', 'is', null));
        await mustDel('colaboradores', _sb.from('colaboradores').delete().not('id', 'is', null));
        await mustDel('equipamentos_calibracao', _sb.from('equipamentos_calibracao').delete().not('id', 'is', null));
        await mustDel('materiais', _sb.from('materiais').delete().gt('id', 0));
        await mustDel('categorias', _sb.from('categorias').delete().gt('id', 0));
      } else {
        await mustDel('movimentacoes', _sb.from('movimentacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        await mustDel('materiais', _sb.from('materiais').delete().gt('id', 0));
        await mustDel('categorias', _sb.from('categorias').delete().gt('id', 0));
      }

      // Insert — no deps
      if (data.categorias.length) {
        const { error } = await _sb.from('categorias').insert(data.categorias.map(nome => ({ nome })));
        if (error) throw new Error('Erro ao inserir categorias: ' + error.message);
      }

      // Materiais
      const matIdMap = {};
      if (data.materiais.length) {
        const { data: newMats, error } = await _sb.from('materiais').insert(data.materiais.map(m => ({
          nome: m.nome, categoria: m.categoria, quantidade: m.quantidade,
          unidade: m.unidade, estoque_minimo: m.estoqueMinimo ?? m.estoque_minimo ?? 0,
          valor_unitario: m.valorUnitario ?? m.valor_unitario ?? 0,
          localizacao: m.localizacao || null
        }))).select('id');
        if (error) throw new Error('Erro ao inserir materiais: ' + error.message);
        data.materiais.forEach((m, i) => { if (newMats[i]) matIdMap[m.id] = newMats[i].id; });
      }

      // Movimentações
      if (data.movimentacoes?.length) {
        const rows = data.movimentacoes
          .filter(m => matIdMap[m.materialId] != null)
          .map(m => ({
            material_id: matIdMap[m.materialId], material_nome: m.materialNome,
            tipo: m.tipo, quantidade: m.quantidade,
            registrado_por: m.registradoPor, observacao: m.observacao || null, data: m.data
          }));
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const { error } = await _sb.from('movimentacoes').insert(rows.slice(i, i + BATCH));
          if (error) throw new Error('Erro ao inserir movimentações: ' + error.message);
        }
      }

      if (ver >= 3) {
        // Colaboradores
        const colIdMap = {};
        if (data.colaboradores?.length) {
          const { data: newCols, error } = await _sb.from('colaboradores').insert(
            data.colaboradores.map(c => ({ nome: c.nome, cpf: c.cpf, setor: c.setor || null }))
          ).select('id');
          if (error) throw new Error('Erro ao inserir colaboradores: ' + error.message);
          data.colaboradores.forEach((c, i) => { if (newCols[i]) colIdMap[c.id] = newCols[i].id; });
        }

        // Ferramentas
        const ferrIdMap = {};
        if (data.ferramentas?.length) {
          const { data: newFerrs, error } = await _sb.from('ferramentas_cautela').insert(
            data.ferramentas.map(f => ({
              nome: f.nome, codigo: f.codigo || null, categoria: f.categoria || null,
              quantidade_total: f.quantidadeTotal, quantidade_disponivel: f.quantidadeDisponivel
            }))
          ).select('id');
          if (error) throw new Error('Erro ao inserir ferramentas: ' + error.message);
          data.ferramentas.forEach((f, i) => { if (newFerrs[i]) ferrIdMap[f.id] = newFerrs[i].id; });
        }

        // Equipamentos
        const equipIdMap = {};
        if (data.equipamentos?.length) {
          const { data: newEquips, error } = await _sb.from('equipamentos_calibracao').insert(
            data.equipamentos.map(eq => ({
              nome: eq.nome, identificacao: eq.identificacao || null,
              categoria: eq.categoria, numero_certificado: eq.numeroCertificado || null,
              certificado_path: eq.certificadoPath || null,
              data_ultima_calibracao: eq.dataUltimaCalibracao,
              validade_meses: eq.validadeMeses,
              data_proxima_calibracao: eq.dataProximaCalibracao,
              responsavel: eq.responsavel || null,
              em_calibracao: eq.emCalibracao || false
            }))
          ).select('id');
          if (error) throw new Error('Erro ao inserir equipamentos: ' + error.message);
          data.equipamentos.forEach((eq, i) => { if (newEquips[i]) equipIdMap[eq.id] = newEquips[i].id; });
        }

        // Histórico calibrações (depends on equipamentos)
        if (data.calibracoesHistorico?.length) {
          const rows = data.calibracoesHistorico
            .filter(h => equipIdMap[h.equipamento_id] != null)
            .map(h => ({
              equipamento_id: equipIdMap[h.equipamento_id],
              equipamento_nome: h.equipamento_nome,
              data_calibracao: h.data_calibracao, data_proxima: h.data_proxima,
              numero_certificado: h.numero_certificado || null,
              certificado_path: h.certificado_path || null,
              responsavel: h.responsavel || null,
              registrado_por: h.registrado_por || null,
              observacao: h.observacao || null
            }));
          if (rows.length) {
            const { error } = await _sb.from('calibracoes_historico').insert(rows);
            if (error) throw new Error('Erro ao inserir histórico de calibrações: ' + error.message);
          }
        }

        // Cautelas (depends on colaboradores + ferramentas)
        if (data.cautelas?.length) {
          const rows = data.cautelas
            .filter(c => colIdMap[c.colaboradorId] != null && ferrIdMap[c.ferramentaId] != null)
            .map(c => ({
              colaborador_id: colIdMap[c.colaboradorId], colaborador_nome: c.colaboradorNome,
              ferramenta_id: ferrIdMap[c.ferramentaId], ferramenta_nome: c.ferramentaNome,
              ferramenta_codigo: c.ferramentaCodigo || null,
              setor: c.setor || null, quantidade: c.quantidade ?? 1,
              observacao: c.observacao || null,
              data_retirada: c.dataRetirada, data_devolucao: c.dataDevolucao || null,
              condicao_devolucao: c.condicaoDevolucao || null,
              alerta_enviado: c.alertaEnviado || false
            }));
          if (rows.length) {
            const { error } = await _sb.from('cautelas').insert(rows);
            if (error) throw new Error('Erro ao inserir cautelas: ' + error.message);
          }
        }
      }

      await loadAllData();
      refreshAllSections();
      alert('Backup restaurado com sucesso!');
    } catch(err) { alert('Erro ao restaurar: ' + err.message); }
  };
  reader.readAsText(file);
  input.value = '';
}
