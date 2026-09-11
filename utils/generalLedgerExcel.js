const ExcelJS = require('exceljs');

const thin = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

const peachFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4D6' } // Cor do cabeçalho da Imagem 3 da Dra. Edma
};

const yellowFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' }
};

const totalFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' }
};

const boldTotalFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' }
};

async function generateGeneralLedgerExcel(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeopleCore';
  workbook.created = new Date();

  // =========================================================================
  // ABA 1: GENERAL LEDGER (GL) POR CENTRO DE CUSTO E CONTA RAZÃO (IMAGEM 3)
  // =========================================================================
  const wsGL = workbook.addWorksheet('GL - Matriz por Conta e CC', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9
    },
    views: [{ showGridLines: true }]
  });

  // Larguras das colunas:
  // A: Centro de custos (18)
  // B: Conta Razão (16)
  // C: Descrição (34)
  // D: Código rúbrica salarial (12)
  // E: Nome (28)
  // F..Q: 12 Meses (13 cada)
  // R: Total (15)
  // S: FTE (10)
  const widths = [18, 16, 36, 14, 28, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 16, 10];
  widths.forEach((w, i) => {
    wsGL.getColumn(i + 1).width = w;
  });

  // Linha 1: Título e sub-indicação
  wsGL.getRow(1).height = 24;
  const periodoStr = data.periodo?.mes && data.periodo.mes !== 'Todos os meses'
    ? `Mês: ${data.periodo.mes} / Ano: ${data.periodo?.ano}`
    : `Ano: ${data.periodo?.ano}`;
  wsGL.mergeCells('A1:E1');
  wsGL.getCell('A1').value = `${data.empresa?.nome || 'PeopleCore'} - General Ledger (GL) - ${periodoStr}`;
  wsGL.getCell('A1').font = { bold: true, size: 11, color: { argb: 'FF1F2937' } };
  wsGL.getCell('A1').alignment = { vertical: 'middle' };

  wsGL.mergeCells('F1:S1');
  wsGL.getCell('F1').value = `Total Colaboradores: ${data.fte_resumo?.total_colaboradores || 0} | Total FTE: ${data.fte_resumo?.total_fte || 0} | Moeda: MT`;
  wsGL.getCell('F1').font = { italic: true, size: 9.5, color: { argb: 'FF4B5563' } };
  wsGL.getCell('F1').alignment = { horizontal: 'right', vertical: 'middle' };

  // Linha 2: Cabeçalhos da Tabela Principal
  const headerRow = 2;
  wsGL.getRow(headerRow).height = 26;

  const colHeaders = [
    'Centro de custos',
    'Conta Razão',
    'Descrição',
    'Código rúbrica salarial',
    'Nome',
    'Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.',
    'Julho', 'Agosto', 'Set.', 'Out.', 'Nov.', 'Dez.',
    'Total',
    'FTE'
  ];

  colHeaders.forEach((h, idx) => {
    const cell = wsGL.getCell(headerRow, idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FF111827' } };
    cell.fill = peachFill;
    cell.border = thin;
    cell.alignment = {
      horizontal: idx >= 5 ? 'right' : (idx === 3 ? 'center' : 'left'),
      vertical: 'middle'
    };
  });

  // Linha 3: Indicação "Pagamentos em: MT"
  wsGL.getRow(3).height = 18;
  wsGL.getCell('C3').value = 'Pagamentos em: MT';
  wsGL.getCell('C3').font = { bold: true, size: 8.5, color: { argb: 'FF374151' } };
  for (let c = 1; c <= colHeaders.length; c++) {
    wsGL.getCell(3, c).border = thin;
  }

  let rowIdx = 4;

  (data.centros_de_custo || []).forEach((cc) => {
    const isFirstCcRow = true;

    (cc.colaboradores || []).forEach((colab) => {
      // Linha de cabeçalho do colaborador (com código no campo Descrição)
      wsGL.getRow(rowIdx).height = 19;
      wsGL.getCell(rowIdx, 1).value = cc.codigo;
      wsGL.getCell(rowIdx, 1).font = { size: 9, bold: true };
      wsGL.getCell(rowIdx, 1).border = thin;

      wsGL.getCell(rowIdx, 2).border = thin;

      wsGL.getCell(rowIdx, 3).value = colab.codigo_interno || '—';
      wsGL.getCell(rowIdx, 3).font = { size: 9, bold: true };
      wsGL.getCell(rowIdx, 3).border = thin;

      wsGL.getCell(rowIdx, 4).border = thin;

      wsGL.getCell(rowIdx, 5).value = colab.nome;
      wsGL.getCell(rowIdx, 5).font = { size: 9, bold: true };
      wsGL.getCell(rowIdx, 5).border = thin;

      for (let c = 6; c <= 18; c++) {
        wsGL.getCell(rowIdx, c).border = thin;
      }

      wsGL.getCell(rowIdx, 19).value = colab.fte;
      wsGL.getCell(rowIdx, 19).font = { size: 9, bold: true };
      wsGL.getCell(rowIdx, 19).alignment = { horizontal: 'center' };
      wsGL.getCell(rowIdx, 19).border = thin;

      rowIdx += 1;

      // Linhas de cada rúbrica do colaborador
      colab.rubricas.forEach((r) => {
        wsGL.getRow(rowIdx).height = 18;

        wsGL.getCell(rowIdx, 1).border = thin;

        wsGL.getCell(rowIdx, 2).value = r.conta_razao;
        wsGL.getCell(rowIdx, 2).font = { size: 8.5 };
        wsGL.getCell(rowIdx, 2).border = thin;

        wsGL.getCell(rowIdx, 3).value = r.descricao;
        wsGL.getCell(rowIdx, 3).font = { size: 8.5 };
        wsGL.getCell(rowIdx, 3).border = thin;

        wsGL.getCell(rowIdx, 4).value = r.codigo_rubrica;
        wsGL.getCell(rowIdx, 4).font = { size: 8.5 };
        wsGL.getCell(rowIdx, 4).alignment = { horizontal: 'center' };
        wsGL.getCell(rowIdx, 4).border = thin;

        wsGL.getCell(rowIdx, 5).value = colab.nome;
        wsGL.getCell(rowIdx, 5).font = { size: 8.5, color: { argb: 'FF6B7280' } };
        wsGL.getCell(rowIdx, 5).border = thin;

        // Meses Jan..Dez
        for (let m = 0; m < 12; m++) {
          const val = r.valores_meses[m];
          const cell = wsGL.getCell(rowIdx, 6 + m);
          cell.value = val !== 0 ? val : null;
          cell.font = { size: 8.5 };
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
          cell.border = thin;
        }

        // Total
        const cellTot = wsGL.getCell(rowIdx, 18);
        cellTot.value = r.total !== 0 ? r.total : null;
        cellTot.font = { size: 8.5, bold: true };
        cellTot.numFmt = '#,##0.00';
        cellTot.alignment = { horizontal: 'right' };
        cellTot.border = thin;

        wsGL.getCell(rowIdx, 19).border = thin;

        rowIdx += 1;
      });

      // Linha: Total Funcionário
      wsGL.getRow(rowIdx).height = 19;
      for (let c = 1; c <= 19; c++) {
        const cell = wsGL.getCell(rowIdx, c);
        cell.border = thin;
        cell.fill = totalFill;
      }

      wsGL.getCell(rowIdx, 3).value = 'Total Funcionário';
      wsGL.getCell(rowIdx, 3).font = { size: 9, bold: true };

      wsGL.getCell(rowIdx, 5).value = colab.nome;
      wsGL.getCell(rowIdx, 5).font = { size: 9, bold: true };

      for (let m = 0; m < 12; m++) {
        const val = colab.total_funcionario_meses[m];
        const cell = wsGL.getCell(rowIdx, 6 + m);
        cell.value = val !== 0 ? val : null;
        cell.font = { size: 9, bold: true };
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }

      const cellTotFunc = wsGL.getCell(rowIdx, 18);
      cellTotFunc.value = colab.total_funcionario_ano !== 0 ? colab.total_funcionario_ano : null;
      cellTotFunc.font = { size: 9, bold: true };
      cellTotFunc.numFmt = '#,##0.00';
      cellTotFunc.alignment = { horizontal: 'right' };

      wsGL.getCell(rowIdx, 19).value = colab.fte;
      wsGL.getCell(rowIdx, 19).font = { size: 9, bold: true };
      wsGL.getCell(rowIdx, 19).alignment = { horizontal: 'center' };

      rowIdx += 1;
    });

    // Subtotal do Centro de Custo
    wsGL.getRow(rowIdx).height = 20;
    for (let c = 1; c <= 19; c++) {
      const cell = wsGL.getCell(rowIdx, c);
      cell.border = thin;
      cell.fill = boldTotalFill;
    }
    wsGL.getCell(rowIdx, 1).value = `Subtotal ${cc.nome}`;
    wsGL.getCell(rowIdx, 1).font = { size: 9, bold: true };
    wsGL.getCell(rowIdx, 19).value = cc.fte_total;
    wsGL.getCell(rowIdx, 19).font = { size: 9, bold: true };
    wsGL.getCell(rowIdx, 19).alignment = { horizontal: 'center' };

    rowIdx += 2; // Espaço para o próximo CC
  });

  // =========================================================================
  // ABA 2: RESUMO DE PAYROLL SUMMARY + FTE POR CENTRO DE CUSTO
  // =========================================================================
  const wsSum = workbook.addWorksheet('Payroll Summary + FTE', {
    views: [{ showGridLines: true }]
  });

  const sumHeaders = [
    'Centro de Custo / Departamento',
    'Headcount',
    'Total FTE',
    'Total Salário Bruto (MT)',
    'Total Descontos (MT)',
    'Total Salário Líquido (MT)'
  ];

  wsSum.getRow(1).height = 24;
  wsSum.mergeCells('A1:F1');
  wsSum.getCell('A1').value = `Payroll Summary & Full Time Employee (FTE) - ${data.periodo?.ano}`;
  wsSum.getCell('A1').font = { bold: true, size: 12 };

  wsSum.getRow(3).height = 22;
  sumHeaders.forEach((h, idx) => {
    const cell = wsSum.getCell(3, idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9.5 };
    cell.fill = yellowFill;
    cell.border = thin;
    cell.alignment = { horizontal: idx >= 1 ? 'right' : 'left', vertical: 'middle' };
  });

  [35, 16, 16, 26, 24, 26].forEach((w, i) => {
    wsSum.getColumn(i + 1).width = w;
  });

  let sumRow = 4;
  (data.centros_de_custo || []).forEach(cc => {
    let brutoCc = 0;
    let descontosCc = 0;
    let liquidoCc = 0;

    cc.colaboradores.forEach(col => {
      col.rubricas.forEach(r => {
        if (r.tipo === 'rendimento') brutoCc += r.total;
        if (r.tipo === 'desconto') descontosCc += r.total;
      });
      liquidoCc += col.total_funcionario_ano;
    });

    wsSum.getRow(sumRow).height = 19;
    wsSum.getCell(sumRow, 1).value = `${cc.codigo} - ${cc.nome}`;
    wsSum.getCell(sumRow, 1).border = thin;

    wsSum.getCell(sumRow, 2).value = cc.total_colaboradores;
    wsSum.getCell(sumRow, 2).alignment = { horizontal: 'right' };
    wsSum.getCell(sumRow, 2).border = thin;

    wsSum.getCell(sumRow, 3).value = cc.fte_total;
    wsSum.getCell(sumRow, 3).alignment = { horizontal: 'right' };
    wsSum.getCell(sumRow, 3).numFmt = '0.0';
    wsSum.getCell(sumRow, 3).border = thin;

    wsSum.getCell(sumRow, 4).value = brutoCc;
    wsSum.getCell(sumRow, 4).alignment = { horizontal: 'right' };
    wsSum.getCell(sumRow, 4).numFmt = '#,##0.00';
    wsSum.getCell(sumRow, 4).border = thin;

    wsSum.getCell(sumRow, 5).value = descontosCc;
    wsSum.getCell(sumRow, 5).alignment = { horizontal: 'right' };
    wsSum.getCell(sumRow, 5).numFmt = '#,##0.00';
    wsSum.getCell(sumRow, 5).border = thin;

    wsSum.getCell(sumRow, 6).value = liquidoCc;
    wsSum.getCell(sumRow, 6).alignment = { horizontal: 'right' };
    wsSum.getCell(sumRow, 6).numFmt = '#,##0.00';
    wsSum.getCell(sumRow, 6).border = thin;

    sumRow += 1;
  });

  // Linha Total da Empresa
  wsSum.getRow(sumRow).height = 22;
  for (let c = 1; c <= 6; c++) {
    const cell = wsSum.getCell(sumRow, c);
    cell.fill = boldTotalFill;
    cell.font = { bold: true, size: 10 };
    cell.border = thin;
  }
  wsSum.getCell(sumRow, 1).value = 'TOTAL GERAL DA EMPRESA';
  wsSum.getCell(sumRow, 2).value = data.fte_resumo?.total_colaboradores || 0;
  wsSum.getCell(sumRow, 3).value = data.fte_resumo?.total_fte || 0;
  wsSum.getCell(sumRow, 3).numFmt = '0.0';
  wsSum.getCell(sumRow, 4).value = data.totals?.total_bruto || 0;
  wsSum.getCell(sumRow, 4).numFmt = '#,##0.00';
  wsSum.getCell(sumRow, 5).value = data.totals?.total_descontos || 0;
  wsSum.getCell(sumRow, 5).numFmt = '#,##0.00';
  wsSum.getCell(sumRow, 6).value = data.totals?.total_liquido || 0;
  wsSum.getCell(sumRow, 6).numFmt = '#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = {
  generateGeneralLedgerExcel,
};
