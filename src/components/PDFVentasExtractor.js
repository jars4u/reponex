import React, { useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

// Asegúrate de haber copiado pdf.worker.js a /public
GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

export default function PDFVentasExtractor({ onProcesado }) {
  const [textoExtraido, setTextoExtraido] = useState("");
  const [procesado, setProcesado] = useState([]);
  const [archivoPDF, setArchivoPDF] = useState(null);


  const extraerDesdeTextoPDF = (textoCompleto) => {
    const productos = [];
    const regex =
      /(\d+)\s+(\d+\.\d{1,2})\s+(.+?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:\.\d{2})?)\s*%\s+(\d+\.\d{2})/g;

    let match;
    let count = 0;

    while ((match = regex.exec(textoCompleto)) !== null) {
      count++;
      const [
        , // ignorar el primer elemento
        codigo,
        vendidos,
        descripcion,
        costoVenta,
        ventaNeta,
        ventaTotal,
        utilidad,
        porcentajeUtilidad,
        existencia,
      ] = match;

      productos.push({
        codigo,
        vendidos: parseFloat(vendidos),
        descripcion: descripcion.trim(),
        costoVenta: parseFloat(costoVenta.replace(/,/g, "")),
        ventaNeta: parseFloat(ventaNeta.replace(/,/g, "")),
        ventaTotal: parseFloat(ventaTotal.replace(/,/g, "")),
        utilidad: parseFloat(utilidad.replace(/,/g, "")),
        porcentajeUtilidad: parseFloat(porcentajeUtilidad),
        existencia: parseFloat(existencia),
      });
    }

    console.log(`✅ Productos procesados (${count}):`, productos);
    return productos;
  };

  const handlePDFUpload = async (e) => {    
    const file = e.target.files[0];
    if (!file) return;
    setArchivoPDF(file);

    const reader = new FileReader();
    reader.onload = async function () {
      const typedarray = new Uint8Array(this.result);

      const pdf = await getDocument({ data: typedarray }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str);
        const text = strings.join(" ");
        fullText += text + "\n";
      }

      setTextoExtraido(fullText);
      setProcesado([]); // Limpiar resultados anteriores
    };

    reader.readAsArrayBuffer(file);
  };


  const procesarTexto = () => {
    const productos = extraerDesdeTextoPDF(textoExtraido);
    setProcesado(productos);
    onProcesado(productos); // Enviar al componente padre
  };

  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold">Cargar PDF de Ventas</h2>
      <p className="text-gray-500 text-xs mb-4">
        Extrae y procesa la información de ventas y existencia de productos desde un archivo PDF.
      </p>
      <div className="flex flex-col gap-2 mt-2">
        <div className="flex justify-between items-center gap-4">
          <input type="file" accept=".pdf" onChange={handlePDFUpload} disabled={!!archivoPDF} />
          <button
            onClick={procesarTexto}
            className="bg-blue-600 text-white text-sm px-2 py-1 rounded hover:bg-blue-700"
            disabled={!archivoPDF}
          >
            Procesar Texto
          </button>
        </div>
      </div>

      {procesado.length > 0 && (
        <div className="mt-6">
          <h3 className="font-bold mb-2">Productos procesados:</h3>
          <ul className="list-disc pl-6 max-h-64 overflow-y-auto text-sm">
            {procesado.map((p, i) => (
              <li key={i}>
                <strong>{p.descripcion}</strong> (Código: {p.codigo}) – Vendido:{" "}
                {p.vendidos} – Existencia: {p.existencia}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
