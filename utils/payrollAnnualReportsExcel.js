const ExcelJS = require('exceljs');

const thin = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

const headerFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4D6' } // Salmão suave padrão Dra. Edma
};

const totalFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' }
};

/**
 * 1. Excel do Net Pay Report (12 Meses + YTD)
 */
async function generateNetPayExcel(data) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Net Pay YTD', { views: [{ showGridLines: true }] });

  ws.getColumn(1).width = 12; // Cód
  ws.getColumn(2).width = 28; // Nome
  ws.getColumn(3).width = 22; // Depto
  for (let i = 4; i <= 15; i++) ws.getColumn(i).width = 13; // Jan..Dez
  ws.getColumn(16).width = 16; // YTD

  const mesTitulo = data.mes && data.mes !== 'Todos os meses' ? ` - Mês: ${data.mes}` : '';
  ws.getCell('A1').value = `${data.empresa?.nome} - Net Pay Report (${data.ano}${mesTitulo})`;
  ws.getCell('A1').font = { bold: true, size: 12 };

  const headerRow = 3;
  ws.getRow(headerRow).height = 24;
  const headers = ['Código', 'Nome', 'Departamento', ...data.meses_curtos, 'Total YTD (MT)'];
  headers.forEach((h, idx) => {
    const cell = ws.getCell(headerRow, idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = headerFill;
    cell.border = thin;
    cell.alignment = { horizontal: idx >= 3 ? 'right' : 'left', vertical: 'middle' };
  });

  let r = 4;
  (data.linhas || []).forEach(l => {
    ws.getRow(r).height = 19;
    ws.getCell(r, 1).value = l.codigo_interno;
    ws.getCell(r, 1).border = thin;
    ws.getCell(r, 2).value = l.nome;
    ws.getCell(r, 2).border = thin;
    ws.getCell(r, 3).value = l.departamento;
    ws.getCell(r, 3).border = thin;

    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, 4 + m);
      cell.value = l.meses[m] !== 0 ? l.meses[m] : null;
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right' };
      cell.border = thin;
    }

    const cellYtd = ws.getCell(r, 16);
    cellYtd.value = l.ytd;
    cellYtd.numFmt = '#,##0.00';
    cellYtd.font = { bold: true };
    cellYtd.alignment = { horizontal: 'right' };
    cellYtd.border = thin;

    r += 1;
  });

  // Linha Total
  ws.getRow(r).height = 22;
  for (let c = 1; c <= 16; c++) {
    const cell = ws.getCell(r, c);
    cell.fill = totalFill;
    cell.font = { bold: true };
    cell.border = thin;
  }
  ws.getCell(r, 1).value = 'TOTAL GERAL';
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, 4 + m);
    cell.value = data.totais_mensais[m];
    cell.numFmt = '#,##0.00';
    cell.alignment = { horizontal: 'right' };
  }
  const totCell = ws.getCell(r, 16);
  totCell.value = data.total_geral_ytd;
  totCell.numFmt = '#,##0.00';
  totCell.alignment = { horizontal: 'right' };

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * 2. Excel do IRPS Report (12 Meses + YTD)
 */
async function generateIrpsExcel(data) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('IRPS YTD', { views: [{ showGridLines: true }] });

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 15; // NUIT
  ws.getColumn(4).width = 22; // Depto
  for (let i = 5; i <= 16; i++) ws.getColumn(i).width = 13;
  ws.getColumn(17).width = 16;

  ws.getRow(1).height = 24;
  const mesTitulo = data.mes && data.mes !== 'Todos os meses' ? ` - Mês: ${data.mes}` : '';
  ws.getCell('A1').value = `${data.empresa?.nome} - IRPS Withholding Report (${data.ano}${mesTitulo})`;
  ws.getCell('A1').font = { bold: true, size: 12 };

  const headerRow = 3;
  ws.getRow(headerRow).height = 24;
  const headers = ['Código', 'Nome', 'NUIT', 'Departamento', ...data.meses_curtos, 'IRPS YTD (MT)'];
  headers.forEach((h, idx) => {
    const cell = ws.getCell(headerRow, idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = headerFill;
    cell.border = thin;
    cell.alignment = { horizontal: idx >= 4 ? 'right' : 'left', vertical: 'middle' };
  });

  let r = 4;
  (data.linhas || []).forEach(l => {
    ws.getRow(r).height = 19;
    ws.getCell(r, 1).value = l.codigo_interno;
    ws.getCell(r, 1).border = thin;
    ws.getCell(r, 2).value = l.nome;
    ws.getCell(r, 2).border = thin;
    ws.getCell(r, 3).value = l.nuit;
    ws.getCell(r, 3).border = thin;
    ws.getCell(r, 4).value = l.departamento;
    ws.getCell(r, 4).border = thin;

    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, 5 + m);
      cell.value = l.meses[m] !== 0 ? l.meses[m] : null;
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right' };
      cell.border = thin;
    }

    const cellYtd = ws.getCell(r, 17);
    cellYtd.value = l.ytd;
    cellYtd.numFmt = '#,##0.00';
    cellYtd.font = { bold: true };
    cellYtd.alignment = { horizontal: 'right' };
    cellYtd.border = thin;

    r += 1;
  });

  // Linha Total
  ws.getRow(r).height = 22;
  for (let c = 1; c <= 17; c++) {
    const cell = ws.getCell(r, c);
    cell.fill = totalFill;
    cell.font = { bold: true };
    cell.border = thin;
  }
  ws.getCell(r, 1).value = 'TOTAL IRPS';
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, 5 + m);
    cell.value = data.totais_mensais[m];
    cell.numFmt = '#,##0.00';
    cell.alignment = { horizontal: 'right' };
  }
  const totCell = ws.getCell(r, 17);
  totCell.value = data.total_geral_ytd;
  totCell.numFmt = '#,##0.00';
  totCell.alignment = { horizontal: 'right' };

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * 3. Excel do Total Cost to Company (TCTC)
 */
async function generateTotalCostToCompanyExcel(data) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Total Cost to Company', { views: [{ showGridLines: true }] });

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 20; // Salário Bruto
  ws.getColumn(5).width = 18; // INSS Patronal 4%
  ws.getColumn(6).width = 18; // Fringe Benefits
  ws.getColumn(7).width = 22; // Total Cost
  for (let i = 8; i <= 19; i++) ws.getColumn(i).width = 13;

  ws.getRow(1).height = 24;
  const mesTitulo = data.mes && data.mes !== 'Todos os meses' ? ` - Mês: ${data.mes}` : '';
  ws.getCell('A1').value = `${data.empresa?.nome} - Total Cost to Company Report (${data.ano}${mesTitulo})`;
  ws.getCell('A1').font = { bold: true, size: 12 };

  const headerRow = 3;
  ws.getRow(headerRow).height = 24;
  const headers = [
    'Código', 'Nome', 'Departamento',
    'Salário Bruto Anual', 'INSS Patronal (4%)', 'Fringe Benefits', 'Custo Total (TCTC)',
    ...data.meses_curtos
  ];

  headers.forEach((h, idx) => {
    const cell = ws.getCell(headerRow, idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = headerFill;
    cell.border = thin;
    cell.alignment = { horizontal: idx >= 3 ? 'right' : 'left', vertical: 'middle' };
  });

  let r = 4;
  (data.linhas || []).forEach(l => {
    ws.getRow(r).height = 19;
    ws.getCell(r, 1).value = l.codigo_interno;
    ws.getCell(r, 1).border = thin;
    ws.getCell(r, 2).value = l.nome;
    ws.getCell(r, 2).border = thin;
    ws.getCell(r, 3).value = l.departamento;
    ws.getCell(r, 3).border = thin;

    ws.getCell(r, 4).value = l.salario_bruto_anual;
    ws.getCell(r, 4).numFmt = '#,##0.00';
    ws.getCell(r, 4).border = thin;

    ws.getCell(r, 5).value = l.inss_patronal_anual;
    ws.getCell(r, 5).numFmt = '#,##0.00';
    ws.getCell(r, 5).border = thin;

    ws.getCell(r, 6).value = l.fringe_benefits_anual;
    ws.getCell(r, 6).numFmt = '#,##0.00';
    ws.getCell(r, 6).border = thin;

    ws.getCell(r, 7).value = l.total_cost_to_company;
    ws.getCell(r, 7).numFmt = '#,##0.00';
    ws.getCell(r, 7).font = { bold: true };
    ws.getCell(r, 7).border = thin;

    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, 8 + m);
      cell.value = l.meses[m] !== 0 ? l.meses[m] : null;
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right' };
      cell.border = thin;
    }

    r += 1;
  });

  // Linha Total Geral
  ws.getRow(r).height = 22;
  for (let c = 1; c <= 19; c++) {
    const cell = ws.getCell(r, c);
    cell.fill = totalFill;
    cell.font = { bold: true };
    cell.border = thin;
  }
  ws.getCell(r, 1).value = 'TOTAL GERAL';
  ws.getCell(r, 4).value = data.totais_gerais?.salario_bruto || 0;
  ws.getCell(r, 4).numFmt = '#,##0.00';
  ws.getCell(r, 5).value = data.totais_gerais?.inss_patronal || 0;
  ws.getCell(r, 5).numFmt = '#,##0.00';
  ws.getCell(r, 6).value = data.totais_gerais?.fringe_benefits || 0;
  ws.getCell(r, 6).numFmt = '#,##0.00';
  ws.getCell(r, 7).value = data.totais_gerais?.total_cost_to_company || 0;
  ws.getCell(r, 7).numFmt = '#,##0.00';

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * 4. Excel do Employee 12 Month Report
 */
async function generateEmployee12MonthExcel(data) {
  const workbook = new ExcelJS.Workbook();

  (data.fichas || []).forEach(f => {
    const sheetName = (f.funcionario.codigo || f.funcionario.nome || 'Colab').slice(0, 30).replace(/[:\/\\?*\[\]]/g, '');
    const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });

    ws.getColumn(1).width = 28; // Rubrica
    for (let i = 2; i <= 13; i++) ws.getColumn(i).width = 13; // Jan..Dez
    ws.getColumn(14).width = 16; // Total Anual

    ws.getRow(1).height = 22;
    ws.getCell('A1').value = `${data.empresa?.nome} - Ficha Anual de Remuneração (${data.ano})`;
    ws.getCell('A1').font = { bold: true, size: 12 };

    ws.getRow(2).height = 18;
    ws.getCell('A2').value = `Colaborador: ${f.funcionario.codigo} - ${f.funcionario.nome} | Cargo: ${f.funcionario.cargo} | Depto: ${f.funcionario.departamento}`;
    ws.getCell('A2').font = { size: 9.5, italic: true };

    const headerRow = 4;
    ws.getRow(headerRow).height = 22;
    const headers = ['Rubrica de Vencimento', 'Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.', 'Total Anual'];
    headers.forEach((h, idx) => {
      const cell = ws.getCell(headerRow, idx + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9 };
      cell.fill = headerFill;
      cell.border = thin;
      cell.alignment = { horizontal: idx >= 1 ? 'right' : 'left', vertical: 'middle' };
    });

    const linhasRubricas = [
      { key: 'salario_base', label: 'Salário Base' },
      { key: 'horas_extras', label: 'Horas Extras' },
      { key: 'bonus', label: 'Bónus & Prémios' },
      { key: 'subsidios', label: 'Subsídios (Alim. & Transp.)' },
      { key: 'ferias', label: 'Subsídio de Férias' },
      { key: 'salario_bruto', label: 'TOTAL BRUTO (Rendimentos)', isBold: true },
      { key: 'inss_trabalhador', label: 'INSS Trabalhador (3%)' },
      { key: 'irps', label: 'Retenção de IRPS' },
      { key: 'outros_descontos', label: 'Outros Descontos Internos' },
      { key: 'total_descontos', label: 'TOTAL DESCONTOS', isBold: true },
      { key: 'salario_liquido', label: 'SALÁRIO LÍQUIDO A PAGAR', isBold: true, isFinal: true }
    ];

    let r = 5;
    linhasRubricas.forEach(lr => {
      ws.getRow(r).height = 19;
      const cellLbl = ws.getCell(r, 1);
      cellLbl.value = lr.label;
      cellLbl.font = { size: 9, bold: lr.isBold };
      cellLbl.border = thin;

      if (lr.isFinal) {
        cellLbl.fill = totalFill;
      }

      for (let m = 0; m < 12; m++) {
        const cell = ws.getCell(r, 2 + m);
        const val = f.meses[m][lr.key];
        cell.value = val !== 0 ? val : null;
        cell.font = { size: 9, bold: lr.isBold };
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
        cell.border = thin;
        if (lr.isFinal) cell.fill = totalFill;
      }

      const totCell = ws.getCell(r, 14);
      totCell.value = f.totais[lr.key];
      totCell.font = { size: 9, bold: true };
      totCell.numFmt = '#,##0.00';
      totCell.alignment = { horizontal: 'right' };
      totCell.border = thin;
      if (lr.isFinal) totCell.fill = totalFill;

      r += 1;
    });
  });

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = {
  generateNetPayExcel,
  generateIrpsExcel,
  generateTotalCostToCompanyExcel,
  generateEmployee12MonthExcel
};
