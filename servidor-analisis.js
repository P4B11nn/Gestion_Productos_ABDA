/**
 * Servicio de análisis de datos para generar datos para gráficas
 * Este script consulta la base de datos y proporciona endpoints para alimentar las visualizaciones
 */

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

// Configuración del servidor
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Redirigir la página raíz a analisis.html
app.get('/', (req, res) => {
  res.redirect('/analisis.html');
});

// Configuración de la base de datos
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Crear pool de conexiones
const pool = mysql.createPool(dbConfig);

// Verificar conexión a la base de datos
app.get('/api/status', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    res.json({ status: 'Conexión a la base de datos establecida correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al conectar a la base de datos', details: error.message });
  }
});

// Endpoint para listar productos (similar al de server.js)
app.get('/api/productos', async (req, res) => {
  try {
    // Obtener parámetro de búsqueda si existe
    const searchTerm = req.query.search ? req.query.search.trim() : '';
    
    // Verificar si existe DimensionProductos, sino usar la tabla Productos directamente
    const [tablesCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'DimensionProductos'
    `);
    
    let query;
    let params = [];
    
    if (tablesCheck.length > 0) {
      // Usar DimensionProductos si existe
      // Usamos GROUP BY nombre para eliminar duplicados y MIN para tomar el menor ID de cada grupo
      if (searchTerm) {
        // Con búsqueda
        query = `
          SELECT 
            MIN(producto_id) as id, 
            nombre, 
            MAX(categoria) as categoria,
            MIN(precio_actual) as precio_actual, 
            SUM(stock_actual) as stock_actual,
            MIN(punto_reorden) as punto_reorden
          FROM DimensionProductos
          WHERE nombre LIKE ?
          GROUP BY nombre
          ORDER BY nombre
          LIMIT 100
        `;
        params.push(`%${searchTerm}%`);
      } else {
        // Sin búsqueda - mostrar todos (con límite)
        query = `
          SELECT 
            MIN(producto_id) as id, 
            nombre, 
            MAX(categoria) as categoria,
            MIN(precio_actual) as precio_actual, 
            SUM(stock_actual) as stock_actual,
            MIN(punto_reorden) as punto_reorden
          FROM DimensionProductos
          GROUP BY nombre
          ORDER BY nombre
          LIMIT 50
        `;
      }
    } else {
      // Fallback a tabla Productos original si no existe la dimensional
      if (searchTerm) {
        // Con búsqueda
        query = `
          SELECT 
            id, 
            nombre, 
            estado as categoria,
            precio_actual, 
            stock_actual,
            punto_reorden
          FROM Productos
          WHERE nombre LIKE ?
          ORDER BY nombre
          LIMIT 100
        `;
        params.push(`%${searchTerm}%`);
      } else {
        // Sin búsqueda - mostrar todos (con límite)
        query = `
          SELECT 
            id, 
            nombre, 
            estado as categoria,
            precio_actual, 
            stock_actual,
            punto_reorden
          FROM Productos
          ORDER BY nombre
          LIMIT 50
        `;
      }
    }
    
    // Ejecutar la consulta con o sin parámetros de búsqueda
    const [productos] = await pool.query(query, params);
    
    // Log para diagnóstico
    if (searchTerm) {
      console.log(`Búsqueda de productos con término: "${searchTerm}" - Resultados: ${productos.length}`);
    }
    
    res.json({
      success: true,
      productos: productos,
      searchTerm: searchTerm || null
    });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener productos',
      details: error.message
    });
  }
});

// Endpoint para obtener los productos más vendidos
app.get('/api/productos/mas-vendidos', async (req, res) => {
  try {
    // Determinar si usamos el modelo dimensional o transaccional
    const [dimensionalCheck] = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'hechosventas'
    `);
    
    if (dimensionalCheck[0].count > 0) {
      // Usar modelo dimensional
      const [rows] = await pool.query(`
        SELECT 
          dp.producto_id,
          dp.nombre,
          SUM(hv.cantidad_vendida) as total_vendido,
          SUM(hv.subtotal) as ingresos_totales,
          AVG(hv.precio_unitario) as precio_promedio
        FROM hechosventas hv
        JOIN dimensionproductos dp ON hv.producto_id = dp.producto_id
        GROUP BY dp.producto_id, dp.nombre
        ORDER BY total_vendido DESC
        LIMIT 20
      `);
      res.json(rows);
    } else {
      // Usar modelo transaccional
      const [rows] = await pool.query(`
        SELECT 
          p.id as producto_id,
          p.nombre,
          SUM(dt.cantidad) as total_vendido,
          SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
          AVG(dt.precio_unitario_venta) as precio_promedio
        FROM detalletransaccion dt
        JOIN productos p ON dt.producto_id = p.id
        GROUP BY p.id, p.nombre
        ORDER BY total_vendido DESC
        LIMIT 20
      `);
      res.json(rows);
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos más vendidos', details: error.message });
  }
});

// Endpoint para obtener ventas por categoría
app.get('/api/ventas/por-categoria', async (req, res) => {
  try {
    // Verificar si existe DimensionProductos
    const [dimensionCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'dimensionproductos'
    `);
    
    let query;
    
    if (dimensionCheck.length > 0) {
      // Usar tabla dimensional que tiene la columna categoria
      query = `
        SELECT 
          dp.categoria,
          SUM(dt.cantidad) as total_vendido,
          COUNT(DISTINCT dt.transaccion_id) as numero_transacciones,
          SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
          COUNT(DISTINCT dp.producto_id) as cantidad_productos
        FROM detalletransaccion dt
        JOIN dimensionproductos dp ON dt.producto_id = dp.producto_id
        WHERE dp.categoria IS NOT NULL
        GROUP BY dp.categoria
        ORDER BY total_vendido DESC
      `;
    } else {
      // Fallback: usar tabla productos con estado como categoría
      query = `
        SELECT 
          p.estado as categoria,
          SUM(dt.cantidad) as total_vendido,
          COUNT(DISTINCT dt.transaccion_id) as numero_transacciones,
          SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
          COUNT(DISTINCT p.id) as cantidad_productos
        FROM detalletransaccion dt
        JOIN productos p ON dt.producto_id = p.id
        GROUP BY p.estado
        ORDER BY total_vendido DESC
      `;
    }
    
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener ventas por categoría:', error);
    res.status(500).json({ error: 'Error al obtener ventas por categoría', details: error.message });
  }
});

// Endpoint para obtener tendencias temporales de ventas
app.get('/api/ventas/tendencias', async (req, res) => {
  try {
    // Determinar si usamos el modelo dimensional o transaccional
    const [dimensionalCheck] = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'dimensionfechas'
    `);
    
    if (dimensionalCheck[0].count > 0) {
      // Usar modelo dimensional
      const [rows] = await pool.query(`
        SELECT 
          CONCAT(df.anio, '-', LPAD(df.mes, 2, '0')) as periodo,
          SUM(hv.cantidad_vendida) as total_vendido,
          SUM(hv.subtotal) as ingresos_totales,
          COUNT(DISTINCT hv.transaccion_id) as numero_transacciones
        FROM hechosventas hv
        JOIN dimensionfechas df ON hv.fecha_id = df.fecha_id
        GROUP BY df.anio, df.mes
        ORDER BY df.anio, df.mes
      `);
      res.json(rows);
    } else {
      // Usar modelo transaccional
      const [rows] = await pool.query(`
        SELECT 
          DATE_FORMAT(t.fecha_transaccion, '%Y-%m') as periodo,
          SUM(dt.cantidad) as total_vendido,
          SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
          COUNT(DISTINCT t.id) as numero_transacciones
        FROM detalletransaccion dt
        JOIN transacciones t ON dt.transaccion_id = t.id
        GROUP BY DATE_FORMAT(t.fecha_transaccion, '%Y-%m')
        ORDER BY periodo
      `);
      res.json(rows);
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tendencias de ventas', details: error.message });
  }
});

// Endpoint para obtener detalles específicos de un producto
app.get('/api/productos/:id/detalles', async (req, res) => {
  const { id } = req.params;
  try {
    // Información general del producto
    const [productoInfo] = await pool.query(`
      SELECT * FROM productos WHERE id = ?
    `, [id]);
    
    if (productoInfo.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    // Historial de ventas del producto
    const [historialVentas] = await pool.query(`
      SELECT 
        DATE_FORMAT(t.fecha_transaccion, '%Y-%m-%d') as fecha,
        dt.cantidad,
        dt.precio_unitario_venta,
        (dt.cantidad * dt.precio_unitario_venta) as subtotal
      FROM detalletransaccion dt
      JOIN transacciones t ON dt.transaccion_id = t.id
      WHERE dt.producto_id = ?
      ORDER BY t.fecha_transaccion
    `, [id]);
    
    // Resumen de ventas por mes
    const [ventasPorMes] = await pool.query(`
      SELECT 
        DATE_FORMAT(t.fecha_transaccion, '%Y-%m') as mes,
        SUM(dt.cantidad) as total_vendido,
        AVG(dt.precio_unitario_venta) as precio_promedio,
        SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales
      FROM detalletransaccion dt
      JOIN transacciones t ON dt.transaccion_id = t.id
      WHERE dt.producto_id = ?
      GROUP BY DATE_FORMAT(t.fecha_transaccion, '%Y-%m')
      ORDER BY mes
    `, [id]);
    
    res.json({
      informacion: productoInfo[0],
      historialVentas,
      ventasPorMes
    });
  } catch (error) {
    res.status(500).json({ error: `Error al obtener detalles del producto ${id}`, details: error.message });
  }
});

// Endpoint para obtener información para pronóstico de demanda
app.get('/api/productos/:id/pronostico', async (req, res) => {
  const { id } = req.params;
  try {
    // Datos históricos para análisis de tendencias
    const [datosHistoricos] = await pool.query(`
      SELECT 
        DATE_FORMAT(t.fecha_transaccion, '%Y-%m') as periodo,
        SUM(dt.cantidad) as cantidad_vendida,
        AVG(dt.precio_unitario_venta) as precio_promedio
      FROM detalletransaccion dt
      JOIN transacciones t ON dt.transaccion_id = t.id
      WHERE dt.producto_id = ?
      GROUP BY DATE_FORMAT(t.fecha_transaccion, '%Y-%m')
      ORDER BY periodo
    `, [id]);
    
    // Información del stock actual
    const [stockInfo] = await pool.query(`
      SELECT id, nombre, stock_actual, punto_reorden FROM productos WHERE id = ?
    `, [id]);
    
    // Calcular tendencia simple basada en los últimos meses
    let tendencia = 0;
    if (datosHistoricos.length >= 2) {
      // Calculamos el promedio de cambio entre periodos
      let cambioTotal = 0;
      for (let i = 1; i < datosHistoricos.length; i++) {
        cambioTotal += datosHistoricos[i].cantidad_vendida - datosHistoricos[i-1].cantidad_vendida;
      }
      tendencia = cambioTotal / (datosHistoricos.length - 1);
    }
    
    // Proyección simple para los próximos 3 meses
    let ultimaCantidad = datosHistoricos.length > 0 ? datosHistoricos[datosHistoricos.length - 1].cantidad_vendida : 0;
    const pronostico = [
      { periodo: 'Mes 1', cantidad_estimada: Math.max(0, Math.round(ultimaCantidad + tendencia)) },
      { periodo: 'Mes 2', cantidad_estimada: Math.max(0, Math.round(ultimaCantidad + tendencia * 2)) },
      { periodo: 'Mes 3', cantidad_estimada: Math.max(0, Math.round(ultimaCantidad + tendencia * 3)) }
    ];
    
    res.json({
      datosHistoricos,
      stockActual: stockInfo.length > 0 ? stockInfo[0] : null,
      tendencia,
      pronostico
    });
  } catch (error) {
    res.status(500).json({ error: `Error al generar pronóstico para el producto ${id}`, details: error.message });
  }
});

// Endpoint para obtener detalles básicos de un producto específico
app.get('/api/productos/:id/indicadores', async (req, res) => {
  const productoId = req.params.id;
  
  try {
    // Verificar si existe DimensionProductos, sino usar la tabla Productos directamente
    const [tablesCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'DimensionProductos'
    `);
    
    let productoQuery;
    if (tablesCheck.length > 0) {
      // Usar DimensionProductos si existe
      productoQuery = `
        SELECT producto_id, nombre, precio_actual, stock_actual, punto_reorden, categoria  
        FROM DimensionProductos 
        WHERE producto_id = ?
      `;
    } else {
      // Fallback a tabla Productos original
      productoQuery = `
        SELECT id as producto_id, nombre, precio_actual, stock_actual, punto_reorden, estado as categoria  
        FROM Productos 
        WHERE id = ?
      `;
    }
    
    const [productoInfo] = await pool.query(productoQuery, [productoId]);
    
    if (productoInfo.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Producto no encontrado' 
      });
    }
    
    const producto = productoInfo[0];
    
    // Objeto para almacenar los indicadores
    const indicadores = {
      combo: null,
      bajo_stock: null,
      demanda: null,
      recomendaciones: []
    };
    
    // 1. INDICADOR COMBO Y RECOMENDACIONES: Productos relacionados por patrones de compra
    try {
      // Verificar si la tabla PatronesCompra existe
      const [patronesTableCheck] = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = '${dbConfig.database}'
        AND table_name = 'PatronesCompra'
      `);
      
      if (patronesTableCheck.length > 0) {
        // La tabla PatronesCompra existe, consultar patrones
        // Buscar patrones donde el producto actual aparece en el antecedente
        const [patronesResult] = await pool.query(`
          SELECT 
            pc.consecuente AS producto_sugerido_id, 
            pc.confianza,
            pc.lift,
            pc.soporte
          FROM PatronesCompra pc
          WHERE JSON_CONTAINS(pc.antecedente, ?)
          ORDER BY pc.confianza DESC, pc.lift DESC
          LIMIT 5
        `, [JSON.stringify(parseInt(productoId))]);
        
        if (patronesResult.length > 0) {
          // Obtener información de todos los productos recomendados
          const productosRecomendados = [];
          
          for (const patron of patronesResult) {
            const consecuenteId = patron.producto_sugerido_id;
            let productoSugeridoQuery;
            
            if (tablesCheck.length > 0) {
              productoSugeridoQuery = `
                SELECT producto_id, nombre, precio_actual FROM DimensionProductos WHERE producto_id = ?
              `;
            } else {
              productoSugeridoQuery = `
                SELECT id as producto_id, nombre, precio_actual FROM Productos WHERE id = ?
              `;
            }
            
            const [productoSugerido] = await pool.query(productoSugeridoQuery, [consecuenteId]);
            
            if (productoSugerido.length > 0) {
              productosRecomendados.push({
                producto_id: productoSugerido[0].producto_id,
                producto_nombre: productoSugerido[0].nombre,
                precio: productoSugerido[0].precio_actual,
                confianza: patron.confianza,
                lift: patron.lift,
                soporte: patron.soporte
              });
            }
          }
          
          // Asignar recomendaciones al objeto indicadores
          indicadores.recomendaciones = productosRecomendados;
          
          // Asignar el combo principal (el primero de la lista)
          if (productosRecomendados.length > 0) {
            const principal = productosRecomendados[0];
            const confianzaPorcentaje = Math.round(principal.confianza * 100);
            
            if (confianzaPorcentaje > 70) {
              indicadores.combo = `¡Complemento perfecto! ${principal.producto_nombre} (${confianzaPorcentaje}% de coincidencia)`;
            } else if (confianzaPorcentaje > 50) {
              indicadores.combo = `Recomendado: ${principal.producto_nombre} (${confianzaPorcentaje}% de clientes lo compraron junto)`;
            } else if (confianzaPorcentaje > 30) {
              indicadores.combo = `Frecuentemente comprado con: ${principal.producto_nombre}`;
            }
          }
        }
      }
    } catch (patronesError) {
      console.error('Error al consultar patrones de compra:', patronesError);
      // No fallar la operación completa si solo falla esta parte
    }
    
    // 2. INDICADOR BAJO STOCK: Comparar stock_actual con punto_reorden
    if (producto.stock_actual <= producto.punto_reorden) {
      indicadores.bajo_stock = `¡Atención! Stock bajo: ${producto.stock_actual} unidades (punto de reorden: ${producto.punto_reorden})`;
    }
    
    // Preparar respuesta
    res.json({
      success: true,
      data: indicadores,
      producto: {
        ...producto,
        descripcion: `${producto.nombre} - Precio: $${producto.precio_actual}`
      }
    });
    
  } catch (error) {
    console.error('Error al consultar detalles del producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la solicitud',
      details: error.message
    });
  }
});

// Endpoint para obtener datos históricos de un producto (para gráficas)
app.get('/api/productos/:id/analytics', async (req, res) => {
  const productoId = req.params.id;
  console.log(`Solicitud recibida a /api/productos/${productoId}/analytics`);
  
  try {
    // Obtener primero el nombre del producto para referencia
    let nombreProducto = '';
    
    // Verificar si existe DimensionProductos
    const [dimensionCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'DimensionProductos'
    `);
    
    if (dimensionCheck.length > 0) {
      const [productoInfo] = await pool.query(`
        SELECT nombre FROM DimensionProductos WHERE producto_id = ?
      `, [productoId]);
      
      if (productoInfo.length > 0) {
        nombreProducto = productoInfo[0].nombre;
      }
    }
    
    // Si no se encontró en DimensionProductos o no existe, intentar en Productos
    if (!nombreProducto) {
      const [productoInfo] = await pool.query(`
        SELECT nombre FROM Productos WHERE id = ?
      `, [productoId]);
      
      if (productoInfo.length > 0) {
        nombreProducto = productoInfo[0].nombre;
      } else {
        return res.status(404).json({ 
          success: false, 
          error: 'Producto no encontrado' 
        });
      }
    }
    
    // Generar datos simulados para las gráficas
    const historicoPrecio = generarPreciosHistoricos(productoId);
    const historicoVentas = generarVentasHistoricas(productoId);
    
    // Respuesta con datos simulados
    res.json({
      success: true,
      producto: {
        id: productoId,
        nombre: nombreProducto
      },
      historicoPrecio: historicoPrecio,
      historicoVentas: historicoVentas
    });
    
  } catch (error) {
    console.error('Error al obtener datos de analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la solicitud de datos históricos',
      details: error.message
    });
  }
  
  // Función para generar datos históricos de precio simulados
  function generarPreciosHistoricos(id) {
    const ahora = new Date();
    const año = ahora.getFullYear();
    const precios = [];
    
    // Usar el ID para dar variaciones diferentes a diferentes productos
    const seed = parseInt(id) % 100;
    let precioBase = 100 + (seed * 2);
    
    // Generar 8 trimestres (2 años) de datos
    for (let i = 0; i < 8; i++) {
      const añoTrimestre = año - Math.floor((7 - i) / 4);
      const trimestre = 4 - ((7 - i) % 4);
      
      // Simular tendencia con algo de variación aleatoria
      const variacion = (Math.random() * 10) - 3; // -3 a +7
      precioBase = Math.max(10, precioBase + variacion);
      
      precios.push({
        periodo: `T${trimestre} ${añoTrimestre}`,
        precio: parseFloat(precioBase.toFixed(2))
      });
    }
    
    return precios;
  }
  
  // Función para generar datos históricos de ventas simulados
  function generarVentasHistoricas(id) {
    const ahora = new Date();
    const añoActual = ahora.getFullYear();
    const mesActual = ahora.getMonth();
    const ventas = [];
    
    // Nombres de los meses en español
    const nombresMeses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    // Usar el ID para dar variaciones diferentes a diferentes productos
    const seed = parseInt(id) % 100;
    let ventasBase = 50 + seed;
    let precioBase = 100 + (seed * 2);
    
    // Generar 12 meses de datos
    for (let i = 0; i < 12; i++) {
      // Calcular mes y año para este punto
      let mesIndice = mesActual - (11 - i);
      let año = añoActual;
      
      // Ajustar mes y año si es necesario
      if (mesIndice < 0) {
        mesIndice += 12;
        año--;
      }
      
      // Simular variación estacional y tendencia
      const factorEstacional = 1 + (Math.sin(mesIndice / 12 * Math.PI * 2) * 0.3);
      const tendencia = (i / 24) + 0.5; // Tendencia ligera hacia arriba
      
      // Calcular unidades con algo de variación aleatoria
      const unidades = Math.floor(ventasBase * factorEstacional * tendencia * (0.8 + (Math.random() * 0.4)));
      
      // Calcular precio con variación
      const precio = precioBase * (0.95 + (Math.random() * 0.1));
      
      // Calcular ingresos
      const ingresos = parseFloat((unidades * precio).toFixed(2));
      
      ventas.push({
        periodo: `${nombresMeses[mesIndice]} ${año}`,
        unidades: unidades,
        ingresos: ingresos
      });
      
      // Ajustar precio base para la tendencia
      precioBase = precioBase * (1 + (Math.random() * 0.05 - 0.02));
    }
    
    return ventas;
  }
});

// Endpoint para obtener estadísticas generales del dashboard
app.get('/api/estadisticas/generales', async (req, res) => {
  try {
    // Obtener total de productos
    const [totalProductos] = await pool.query(`
      SELECT COUNT(*) as total FROM DimensionProductos
    `);
    
    // Obtener total de ventas y ingresos
    let totalVentas = 0;
    let totalIngresos = 0;
    let totalTransacciones = 0;
    
    // Verificar si existe el modelo dimensional
    const [dimensionalCheck] = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'hechosventas'
    `);
    
    if (dimensionalCheck[0].count > 0) {
      // Usar modelo dimensional
      const [ventasStats] = await pool.query(`
        SELECT 
          SUM(cantidad_vendida) as total_unidades,
          SUM(subtotal) as total_ingresos,
          COUNT(DISTINCT transaccion_id) as total_transacciones
        FROM hechosventas
      `);
      
      if (ventasStats[0]) {
        totalVentas = ventasStats[0].total_unidades || 0;
        totalIngresos = ventasStats[0].total_ingresos || 0;
        totalTransacciones = ventasStats[0].total_transacciones || 0;
      }
    } else {
      // Usar modelo transaccional
      const [ventasStats] = await pool.query(`
        SELECT 
          SUM(dt.cantidad) as total_unidades,
          SUM(dt.cantidad * dt.precio_unitario_venta) as total_ingresos,
          COUNT(DISTINCT t.id) as total_transacciones
        FROM DetalleTransaccion dt
        JOIN Transacciones t ON dt.transaccion_id = t.id
      `);
      
      if (ventasStats[0]) {
        totalVentas = ventasStats[0].total_unidades || 0;
        totalIngresos = ventasStats[0].total_ingresos || 0;
        totalTransacciones = ventasStats[0].total_transacciones || 0;
      }
    }
    
    // Calcular tendencia mensual (últimos 2 meses)
    let tendenciaMensual = 'Sin datos';
    try {
      if (dimensionalCheck[0].count > 0) {
        const [tendencia] = await pool.query(`
          SELECT 
            YEAR(df.fecha) as año,
            MONTH(df.fecha) as mes,
            SUM(hv.cantidad_vendida) as ventas_mes
          FROM hechosventas hv
          JOIN dimensionfechas df ON hv.fecha_id = df.fecha_id
          WHERE df.fecha >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
          GROUP BY YEAR(df.fecha), MONTH(df.fecha)
          ORDER BY año DESC, mes DESC
          LIMIT 2
        `);
        
        if (tendencia.length >= 2) {
          const ventasActual = tendencia[0].ventas_mes;
          const ventasAnterior = tendencia[1].ventas_mes;
          const cambio = ((ventasActual - ventasAnterior) / ventasAnterior * 100).toFixed(1);
          tendenciaMensual = cambio > 0 ? `+${cambio}%` : `${cambio}%`;
        }
      }
    } catch (error) {
      console.log('No se pudo calcular tendencia mensual:', error.message);
    }
    
    res.json({
      success: true,
      data: {
        totalProductos: totalProductos[0].total,
        totalVentas: totalVentas,
        totalIngresos: parseFloat(totalIngresos).toFixed(2),
        totalTransacciones: totalTransacciones,
        tendenciaMensual: tendenciaMensual
      }
    });
    
  } catch (error) {
    console.error('Error al obtener estadísticas generales:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas generales',
      details: error.message
    });
  }
});

// Endpoint para obtener productos por categoría con datos de ventas
app.get('/api/productos/por-categoria', async (req, res) => {
  const categoria = req.query.categoria;
  
  try {
    // Verificar si existe DimensionProductos
    const [dimensionCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'dimensionproductos'
    `);
    
    let query, params = [];
    
    if (dimensionCheck.length > 0) {
      // Usar tabla dimensional que sí tiene la columna categoria
      query = `
        SELECT 
          dp.producto_id,
          dp.nombre,
          dp.categoria,
          SUM(dt.cantidad) as total_vendido,
          SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
          AVG(dt.precio_unitario_venta) as precio_promedio,
          COUNT(DISTINCT dt.transaccion_id) as numero_transacciones
        FROM detalletransaccion dt
        JOIN dimensionproductos dp ON dt.producto_id = dp.producto_id
      `;
      
      if (categoria && categoria !== '') {
        query += ' WHERE dp.categoria = ?';
        params.push(categoria);
      }
      
      query += `
        GROUP BY dp.producto_id, dp.nombre, dp.categoria
        ORDER BY total_vendido DESC
        LIMIT 50
      `;
    } else {
      // Fallback: usar tabla productos sin categoría (usar estado como categoría)
      query = `
        SELECT 
          p.id as producto_id,
          p.nombre,
          p.estado as categoria,
          SUM(dt.cantidad) as total_vendido,
          SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
          AVG(dt.precio_unitario_venta) as precio_promedio,
          COUNT(DISTINCT dt.transaccion_id) as numero_transacciones
        FROM detalletransaccion dt
        JOIN productos p ON dt.producto_id = p.id
      `;
      
      if (categoria && categoria !== '') {
        query += ' WHERE p.estado = ?';
        params.push(categoria);
      }
      
      query += `
        GROUP BY p.id, p.nombre, p.estado
        ORDER BY total_vendido DESC
        LIMIT 50
      `;
    }
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
    
  } catch (error) {
    console.error('Error al obtener productos por categoría:', error);
    res.status(500).json({ 
      error: 'Error al obtener productos por categoría',
      details: error.message 
    });
  }
});

// Endpoint para obtener todos los patrones de compra
app.get('/api/patrones/todos', async (req, res) => {
  try {
    // Verificar si existe la tabla PatronesCompra
    const [patronesTableCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${dbConfig.database}' 
      AND table_name = 'PatronesCompra'
    `);
    
    if (patronesTableCheck.length === 0) {
      return res.json({
        success: false,
        error: 'La tabla PatronesCompra no existe',
        patrones: []
      });
    }
    
    // Obtener todos los patrones con información de productos
    const [patrones] = await pool.query(`
      SELECT 
        pc.*,
        p1.nombre as producto_antecedente_nombre,
        p1.descripcion as producto_antecedente_descripcion,
        p1.precio_actual as producto_antecedente_precio,
        p2.nombre as producto_sugerido_nombre,
        p2.descripcion as producto_sugerido_descripcion,
        p2.precio_actual as producto_sugerido_precio
      FROM PatronesCompra pc
      LEFT JOIN productos p1 ON CAST(REPLACE(REPLACE(pc.antecedente, '[', ''), ']', '') AS UNSIGNED) = p1.id
      LEFT JOIN productos p2 ON pc.consecuente = p2.id
      ORDER BY pc.confianza DESC, pc.lift DESC
    `);
    
    // Procesar los patrones para extraer los IDs del antecedente
    const processedPatrones = patrones.map(patron => {
      // Extraer ID del antecedente (remover corchetes si existen)
      let antecedenteId = patron.antecedente;
      if (typeof antecedenteId === 'string') {
        antecedenteId = antecedenteId.replace(/[\[\]]/g, '');
      }
      
      return {
        ...patron,
        id: patron.patron_id,
        antecedente_id: antecedenteId,
        consecuente_id: patron.consecuente,
        fecha_creacion: patron.fecha_calculo
      };
    });
    
    res.json({
      success: true,
      patrones: processedPatrones,
      total: processedPatrones.length
    });
    
  } catch (error) {
    console.error('Error al obtener patrones:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener patrones de compra',
      details: error.message
    });
  }
});

// Endpoint para generar reportes
app.get('/api/reportes', async (req, res) => {
  try {
    const { 
      tipo = 'ventas', 
      desde, 
      hasta, 
      categoria, 
      producto,
      formato = 'json' 
    } = req.query;
    
    // Validar fechas
    if (!desde || !hasta) {
      return res.status(400).json({
        success: false,
        error: 'Las fechas desde y hasta son requeridas'
      });
    }
    
    let query = '';
    let params = [];
    let reporteData = {};
    
    switch (tipo) {
      case 'ventas':
        query = `
          SELECT 
            DATE(t.fecha_transaccion) as fecha,
            COUNT(DISTINCT t.id) as numero_transacciones,
            SUM(dt.cantidad) as total_vendido,
            SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
            AVG(dt.precio_unitario_venta) as precio_promedio,
            COUNT(DISTINCT dt.producto_id) as productos_diferentes
          FROM transacciones t
          JOIN detalletransaccion dt ON t.id = dt.transaccion_id
          JOIN productos p ON dt.producto_id = p.id
          WHERE DATE(t.fecha_transaccion) BETWEEN ? AND ?
        `;
        params = [desde, hasta];
        
        if (categoria) {
          query += ' AND p.estado = ?';
          params.push(categoria);
        }
        
        if (producto) {
          query += ' AND p.id = ?';
          params.push(producto);
        }
        
        query += ' GROUP BY DATE(t.fecha_transaccion) ORDER BY fecha DESC';
        break;
        
      case 'productos':
        query = `
          SELECT 
            p.id as producto_id,
            p.nombre,
            p.estado as categoria,
            p.precio_actual,
            SUM(dt.cantidad) as total_vendido,
            SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
            AVG(dt.precio_unitario_venta) as precio_promedio,
            COUNT(DISTINCT dt.transaccion_id) as numero_transacciones,
            MIN(DATE(t.fecha_transaccion)) as primera_venta,
            MAX(DATE(t.fecha_transaccion)) as ultima_venta
          FROM productos p
          JOIN detalletransaccion dt ON p.id = dt.producto_id
          JOIN transacciones t ON dt.transaccion_id = t.id
          WHERE DATE(t.fecha_transaccion) BETWEEN ? AND ?
        `;
        params = [desde, hasta];
        
        if (categoria) {
          query += ' AND p.estado = ?';
          params.push(categoria);
        }
        
        if (producto) {
          query += ' AND p.id = ?';
          params.push(producto);
        }
        
        query += ' GROUP BY p.id, p.nombre, p.estado, p.precio_actual ORDER BY total_vendido DESC';
        break;
        
      case 'categorias':
        query = `
          SELECT 
            p.estado as categoria,
            COUNT(DISTINCT p.id) as cantidad_productos,
            SUM(dt.cantidad) as total_vendido,
            SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
            AVG(dt.precio_unitario_venta) as precio_promedio,
            COUNT(DISTINCT dt.transaccion_id) as numero_transacciones
          FROM productos p
          JOIN detalletransaccion dt ON p.id = dt.producto_id
          JOIN transacciones t ON dt.transaccion_id = t.id
          WHERE DATE(t.fecha_transaccion) BETWEEN ? AND ?
        `;
        params = [desde, hasta];
        
        if (categoria) {
          query += ' AND p.estado = ?';
          params.push(categoria);
        }
        
        query += ' GROUP BY p.estado ORDER BY total_vendido DESC';
        break;
        
      case 'completo':
        // Para reporte completo, devolver un resumen con múltiples consultas
        const [ventasResult] = await pool.query(`
          SELECT 
            COUNT(DISTINCT t.id) as total_transacciones,
            SUM(dt.cantidad) as total_vendido,
            SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
            AVG(dt.cantidad * dt.precio_unitario_venta) as ticket_promedio,
            COUNT(DISTINCT dt.producto_id) as productos_diferentes
          FROM transacciones t
          JOIN detalletransaccion dt ON t.id = dt.transaccion_id
          WHERE DATE(t.fecha_transaccion) BETWEEN ? AND ?
        `, [desde, hasta]);
        
        const [productosResult] = await pool.query(`
          SELECT 
            p.id as producto_id,
            p.nombre,
            p.estado as categoria,
            SUM(dt.cantidad) as total_vendido,
            SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales
          FROM productos p
          JOIN detalletransaccion dt ON p.id = dt.producto_id
          JOIN transacciones t ON dt.transaccion_id = t.id
          WHERE DATE(t.fecha_transaccion) BETWEEN ? AND ?
          GROUP BY p.id, p.nombre, p.estado
          ORDER BY total_vendido DESC
          LIMIT 10
        `, [desde, hasta]);
        
        const [categoriasResult] = await pool.query(`
          SELECT 
            p.estado as categoria,
            COUNT(DISTINCT p.id) as cantidad_productos,
            SUM(dt.cantidad) as total_vendido,
            SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales
          FROM productos p
          JOIN detalletransaccion dt ON p.id = dt.producto_id
          JOIN transacciones t ON dt.transaccion_id = t.id
          WHERE DATE(t.fecha_transaccion) BETWEEN ? AND ?
          GROUP BY p.estado
          ORDER BY total_vendido DESC
        `, [desde, hasta]);
        
        reporteData = {
          success: true,
          tipo: 'completo',
          periodo: { desde, hasta },
          resumen: ventasResult[0],
          topProductos: productosResult,
          categorias: categoriasResult,
          generado: new Date().toISOString()
        };
        
        return res.json(reporteData);
    }
    
    // Ejecutar la consulta principal
    const [rows] = await pool.query(query, params);
    
    // Calcular resumen
    const resumen = {
      total_registros: rows.length,
      total_vendido: rows.reduce((sum, row) => sum + (row.total_vendido || 0), 0),
      ingresos_totales: rows.reduce((sum, row) => sum + (parseFloat(row.ingresos_totales) || 0), 0),
      numero_transacciones: rows.reduce((sum, row) => sum + (row.numero_transacciones || 0), 0)
    };
    
    resumen.ticket_promedio = resumen.numero_transacciones > 0 
      ? resumen.ingresos_totales / resumen.numero_transacciones 
      : 0;
    
    reporteData = {
      success: true,
      tipo,
      periodo: { desde, hasta },
      filtros: { categoria, producto },
      resumen,
      datos: rows,
      generado: new Date().toISOString()
    };
    
    res.json(reporteData);
    
  } catch (error) {
    console.error('Error al generar reporte:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el reporte',
      details: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de análisis de datos funcionando en puerto ${PORT}`);
  console.log(`Visita http://localhost:${PORT} para acceder a las gráficas`);
});