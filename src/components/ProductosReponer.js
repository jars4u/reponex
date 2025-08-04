import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { getDocument } from 'pdfjs-dist';

const pdfjsVersion = '3.11.174'; // Set to the version installed in your project

getDocument.GlobalWorkerOptions = {
  workerSrc: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`,
};

const umbral = 3;

function ProductosReponer() {
  const [productosReponer, setProductosReponer] = useState([]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'pdf') {
      const productos = await procesarPDF(file);
      filtrar(productos);
    } else if (ext === 'csv') {
      const text = await file.text();
      const data = Papa.parse(text, { header: true }).data;
      filtrar(data);
    } else if (ext === 'xls' || ext === 'xlsx') {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);
      filtrar(data);
    } else {
      alert('Formato no soportado. Usa PDF, CSV o Excel.');
    }
  };

  const filtrar = (productos) => {
    const filtrados = productos.filter(
      (p) => parseFloat(p.existencia) <= umbral
    );
    setProductosReponer(filtrados);
  };

  const procesarPDF = async (file) => {
    const pdf = await getDocument(await file.arrayBuffer()).promise;
    let texto = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(' ');
      texto += ' ' + pageText;
    }

    return extraerProductos(texto);
  };

  const extraerProductos = (textoCompleto) => {
    const tokens = textoCompleto.trim().split(/\s+/);
    const productos = [];

    let i = 0;
    while (i < tokens.length - 10) {
      const token = tokens[i];
      if (/^\d{10,14}$/.test(token)) {
        try {
          const codigo = tokens[i];
          const cantidadVendida = parseFloat(tokens[i + 1]);
          let descripcion = '';
          let j = i + 2;
          const numerosDetectados = [];

          while (j < tokens.length && numerosDetectados.length < 7) {
            const posibleNumero = tokens[j].replace(",", "").replace("%", "");
            if (/^\d+(\.\d{1,2})?$/.test(posibleNumero)) {
              numerosDetectados.push(parseFloat(posibleNumero));
            } else {
              descripcion += tokens[j] + ' ';
            }
            j++;
          }

          if (numerosDetectados.length === 7) {
            const existencia = numerosDetectados[6];
            productos.push({
              codigo,
              descripcion: descripcion.trim(),
              cantidadVendida,
              existencia,
            });
            i = j;
          } else {
            i++;
          }
        } catch {
          i++;
        }
      } else {
        i++;
      }
    }

    return productos;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Productos a Reponer</h2>

      <input
        type="file"
        accept=".pdf,.csv,.xls,.xlsx"
        onChange={handleFile}
        className="mb-4"
      />

      {productosReponer.length > 0 ? (
        <table className="w-full border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1">Código</th>
              <th className="border px-2 py-1">Descripción</th>
              <th className="border px-2 py-1">Vendidos</th>
              <th className="border px-2 py-1">Existencia</th>
            </tr>
          </thead>
          <tbody>
            {productosReponer.map((prod, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="border px-2 py-1">{prod.codigo}</td>
                <td className="border px-2 py-1">{prod.descripcion}</td>
                <td className="border px-2 py-1">{prod.cantidadVendida}</td>
                <td className="border px-2 py-1">{prod.existencia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-600">Carga un archivo para ver los productos a reponer.</p>
      )}
    </div>
  );
}

export default ProductosReponer;
