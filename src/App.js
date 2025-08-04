import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import PDFVentasExtractor from "./components/PDFVentasExtractor";
import stringSimilarity from "string-similarity";
import { utils as XLSXUtils } from "xlsx";

export default function App() {
  const [sortBy, setSortBy] = useState("producto");
  const [sortOrder, setSortOrder] = useState("asc");
  const [ventas, setVentas] = useState([]);
  const [catalogosDatos, setCatalogosDatos] = useState([]);
  const [catalogosPDF, setCatalogosPDF] = useState([]);
  const [umbral, setUmbral] = useState(5);
  const [listaReposicion, setListaReposicion] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progreso, setProgreso] = useState(0);

  const handleSort = (campo) => {
    if (sortBy === campo) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(campo);
      setSortOrder("asc");
    }
  };

  const getArrow = (campo) => {
    if (sortBy !== campo) return "";
    return sortOrder === "asc" ? "▲" : "▼";
  };

  const listaReposicionOrdenada = [...listaReposicion].sort((a, b) => {
    let vA = a[sortBy];
    let vB = b[sortBy];
    if (sortBy === "producto" || sortBy === "proveedor") {
      vA = vA?.toUpperCase() || "";
      vB = vB?.toUpperCase() || "";
      if (vA < vB) return sortOrder === "asc" ? -1 : 1;
      if (vA > vB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    } else {
      vA = vA ?? 0;
      vB = vB ?? 0;
      return sortOrder === "asc" ? vA - vB : vB - vA;
    }
  });

  const normalizarNombre = (nombre) => nombre?.toString().trim().toLowerCase();

  const removerAcentos = (str) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const buscarCampo = (obj, posiblesClaves) => {
    const clavesObj = Object.keys(obj);

    for (const campoEsperado of posiblesClaves) {
      const palabrasClave = campoEsperado
        .toLowerCase()
        .split(" ")
        .map(removerAcentos);

      for (const clave of clavesObj) {
        const claveNormalizada = removerAcentos(clave.toLowerCase());
        const contieneTodas = palabrasClave.every((palabra) =>
          claveNormalizada.includes(palabra)
        );
        if (contieneTodas) {
          return obj[clave];
        }
      }
    }

    // Intenta con al menos una palabra clave si no encuentra coincidencia exacta
    for (const clave of clavesObj) {
      const claveNormalizada = removerAcentos(clave.toLowerCase());
      for (const campoEsperado of posiblesClaves) {
        const palabrasClave = campoEsperado
          .toLowerCase()
          .split(" ")
          .map(removerAcentos);
        if (
          palabrasClave.some((palabra) => claveNormalizada.includes(palabra))
        ) {
          return obj[clave];
        }
      }
    }

    return null;
  };

  const parseCsv = (file, setter) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setter(results.data);
      },
    });
  };

  const parseExcel = (file, setter) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const ab = e.target.result;
      const wb = XLSX.read(ab, { type: "array" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];

      // Leer todas las filas para detectar encabezado válido
      const rows = XLSXUtils.sheet_to_json(ws, { header: 1 });

      let inicioTabla = 0;
      for (let i = 0; i < rows.length; i++) {
        const fila = rows[i];
        const encabezado = fila.map((cell) =>
          typeof cell === "string" ? removerAcentos(cell.toLowerCase()) : ""
        );

        const contieneCamposClave = encabezado.some((h) =>
          ["producto", "descripcion", "nombre", "precio", "usd", "$"].some(
            (p) => h.includes(p)
          )
        );

        if (contieneCamposClave && fila.length >= 3) {
          inicioTabla = i;
          break;
        }
      }

      const dataFinal = XLSXUtils.sheet_to_json(ws, { range: inicioTabla });
      setter(dataFinal);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleVentasFileUnificado = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      parseCsv(file, setVentas);
    } else if (ext === "xls" || ext === "xlsx") {
      parseExcel(file, setVentas);
    } else if (ext === "pdf") {
      const buffer = await file.arrayBuffer();
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let texto = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        texto += " " + pageText;
      }

      const productos = extraerDesdeTextoPDF(texto);
      setVentas(productos);
    } else {
      alert("Formato no soportado. Usa PDF, CSV o Excel.");
    }
  };

  const buscarCampoPrecioUSD = (obj) => {
    const clavesObj = Object.keys(obj);

    for (const clave of clavesObj) {
      const normalizada = removerAcentos(clave.toLowerCase());

      if (
        normalizada.includes("precio") &&
        (normalizada.includes("usd") || normalizada.includes("$"))
      ) {
        return obj[clave];
      }
    }

    return null;
  };

  const handleCatalogosFiles = (e) => {
    const files = Array.from(e.target.files);

    files.forEach((file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      const nombreProveedor = file.name.split(".")[0]; // nombre base del archivo como proveedor

      const procesarDatos = (data) => {
        const catalogoNormalizado = data.map((item) => {
          const nombre =
            buscarCampo(item, ["producto", "nombre", "descripcion"]) || "";
          // const precioTexto =
          //   buscarCampo(item, [
          //     "precio",
          //     "$",
          //     "precio $",
          //     "precio usd",
          //     "precio unitario $",
          //     "dólares",
          //     "precio dolar",
          //     "precio en $",
          //   ]) || "";

          const precioUSD = parseFloat(buscarCampoPrecioUSD(item));

          return {
            producto: normalizarNombre(nombre),
            precioUSD: isNaN(precioUSD) ? null : precioUSD,
            proveedor: nombreProveedor,
          };
        });

        console.log("Archivo:", nombreProveedor);
        console.log("Productos cargados del catálogo:", catalogoNormalizado);

        setCatalogosDatos((old) => [...old, ...catalogoNormalizado]);
      };

      if (ext === "csv") {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            procesarDatos(results.data);
          },
        });
      } else if (ext === "xls" || ext === "xlsx") {
        parseExcel(file, procesarDatos);
      } else {
        alert(`Formato no soportado: ${file.name}`);
      }
    });
  };

  const buscarMejorPrecio = (productoBuscado) => {
    const normalizado = normalizarNombre(productoBuscado);
    let mejorCoincidencia = null;
    let mejorPrecio = Infinity;

    catalogosDatos.forEach((item) => {
      if (!item.producto || !item.precioUSD) return;

      const similitud = stringSimilarity.compareTwoStrings(
        normalizado,
        item.producto
      );
      // console.log(
      //   `Comparando: "${normalizado}" vs "${item.producto}" → Similitud: ${similitud}`
      // );
      if (similitud > 0.7 && item.precioUSD < mejorPrecio) {
        mejorPrecio = item.precioUSD;
        mejorCoincidencia = {
          precio: item.precioUSD,
          proveedor: item.proveedor,
        };
      }
    });

    return mejorCoincidencia;
  };

  const generarListaReposicion = () => {
    setLoading(true);
    setProgreso(0);
    const total = ventas.length;
    const lista = [];
    let procesados = 0;
    function procesarSiguiente(i) {
      if (i >= total) {
        setListaReposicion(lista);
        setLoading(false);
        setProgreso(100);
        return;
      }
      const item = ventas[i];
      const posiblesCamposProducto = [
        "producto",
        "nombre",
        "descripcion",
        "descripción",
        "medicamento",
        "principio activo",
        "lista",
        "lista ordenada por principio activo",
      ];
      const prod = normalizarNombre(buscarCampo(item, posiblesCamposProducto));
      const existencia =
        Number(buscarCampo(item, ["existencia", "stock", "disponible"])) || 0;
      if (prod && existencia < umbral) {
        const aReponer = existencia;
        const mejor = buscarMejorPrecio(prod);
        lista.push({
          producto: prod,
          cantidadReponer: aReponer,
          precio: mejor ? mejor.precio : null,
          proveedor: mejor ? mejor.proveedor : "-",
        });
      }
      procesados++;
      setProgreso(Math.round((procesados / total) * 100));
      setTimeout(() => procesarSiguiente(i + 1), 10);
    }
    if (total === 0) {
      setListaReposicion([]);
      setLoading(false);
      setProgreso(100);
    } else {
      procesarSiguiente(0);
    }
  };

  useEffect(() => {
    if (ventas.length && catalogosDatos.length) {
      generarListaReposicion();
    } else {
      setListaReposicion([]);
    }
  }, [ventas, catalogosDatos, umbral]);

  const extraerDesdeTextoPDF = (textoCompleto) => {
    const tokens = textoCompleto.trim().split(/\s+/);
    const productos = [];

    let i = 0;
    while (i < tokens.length - 10) {
      const token = tokens[i];
      if (/^\d{10,14}$/.test(token)) {
        try {
          const codigo = tokens[i];
          const cantidadVendida = parseFloat(tokens[i + 1]);
          let descripcion = "";
          let j = i + 2;
          const numerosDetectados = [];

          while (j < tokens.length && numerosDetectados.length < 7) {
            const posibleNumero = tokens[j].replace(",", "").replace("%", "");
            if (/^\d+(\.\d{1,2})?$/.test(posibleNumero)) {
              numerosDetectados.push(parseFloat(posibleNumero));
            } else {
              descripcion += tokens[j] + " ";
            }
            j++;
          }

          if (numerosDetectados.length === 7) {
            const existencia = numerosDetectados[6];
            productos.push({
              producto: descripcion.trim().toLowerCase(),
              existencia,
              cantidadVendida,
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
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-blue-800">ReponeX</h1>
      <p className="text-gray-600 mb-4">
        Herramienta para la gestión y reposición de productos en farmacias.
      </p>
      <hr />

      {/* Inputs */}
      <div className="max-w-4xl py-4">
        <PDFVentasExtractor onProcesado={setVentas} />
      </div>
      {ventas.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <div>
            <label className="block text-lg font-semibold">
              Catálogos (CSV, Excel o PDF)
            </label>
            <p className="text-gray-500 text-xs mb-4">
              Selecciona los inventarios de las droguerías que deseas cargar.
            </p>
            <input
              type="file"
              multiple
              accept=".csv,.xls,.xlsx,.pdf"
              onChange={handleCatalogosFiles}
            />
            <p className="text-sm text-gray-500 mt-1">
              {catalogosDatos.length} productos, {catalogosPDF.length} PDFs
            </p>
          </div>
        </div>
      )}

      {/* Umbral */}
      <div className="mb-8">
        <label className="font-semibold block mb-1">
          Umbral para reposición:
        </label>
        <input
          type="number"
          min={0}
          value={umbral}
          onChange={(e) => setUmbral(Number(e.target.value))}
          className="border rounded px-3 py-1 w-24"
        />
      </div>

      {/* Lista de reposición */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-green-700">
          Productos a Reponer
        </h2>
        {loading && (
          <div className="w-full bg-gray-200 rounded h-6 mb-4">
            <div
              className="bg-blue-500 h-6 rounded text-white text-center text-sm flex items-center justify-center"
              style={{ width: `${progreso}%`, transition: "width 0.2s" }}
            >
              {progreso}%
            </div>
          </div>
        )}
        {!loading &&
        listaReposicion.length === 0 &&
        ventas.length > 0 &&
        catalogosDatos.length > 0 ? (
          <p className="text-gray-600">
            No hay productos que requieran reposición o falta información.
          </p>
        ) : null}
        {!loading && listaReposicion.length > 0 && (
          <table className="w-full border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th
                  className="border px-2 py-1 text-left cursor-pointer select-none"
                  onClick={() => handleSort("producto")}
                >
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span>Producto</span>
                    <span className="inline-block w-4 text-xs">
                      {getArrow("producto")}
                    </span>
                  </span>
                </th>
                <th
                  className="border px-2 py-1 text-left cursor-pointer select-none"
                  onClick={() => handleSort("cantidadReponer")}
                >
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span>Existencia</span>
                    <span className="inline-block w-4 text-xs">
                      {getArrow("cantidadReponer")}
                    </span>
                  </span>
                </th>
                <th
                  className="border px-2 py-1 text-left cursor-pointer select-none"
                  onClick={() => handleSort("precio")}
                >
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span>Precio</span>
                    <span className="inline-block w-4 text-xs">
                      {getArrow("precio")}
                    </span>
                  </span>
                </th>
                <th
                  className="border px-2 py-1 text-left cursor-pointer select-none"
                  onClick={() => handleSort("proveedor")}
                >
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span>Proveedor</span>
                    <span className="inline-block w-4 text-xs">
                      {getArrow("proveedor")}
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listaReposicionOrdenada.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border px-2 py-1">
                    {item.producto?.toUpperCase()}
                  </td>
                  <td className="border px-2 py-1">{item.cantidadReponer}</td>
                  <td className="border px-2 py-1">
                    {item.precio !== null ? `$${item.precio.toFixed(2)}` : "-"}
                  </td>
                  <td className="border px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs">
                    {item.proveedor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* PDFs */}
      {catalogosPDF.length > 0 && (
        <div className="mt-10">
          <h3 className="text-lg font-semibold mb-4">Catálogos PDF</h3>
          <div className="grid md:grid-cols-2 gap-6">
            {catalogosPDF.map((url, i) => (
              <iframe
                key={i}
                src={url}
                title={`Catálogo PDF ${i + 1}`}
                className="w-full h-96 border"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
