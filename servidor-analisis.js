/**
 * Servicio de análisis de datos para generar datos para gráficas
 * Este script consulta la base de datos y proporciona endpoints para alimentar las visualizaciones
 */

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

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

// Función auxiliar para generar recomendaciones de acción
function getRecomendacionAccion(producto) {
    if (producto.stock_actual === 0) {
        return '🚨 RESTOCK URGENTE - Producto completamente agotado';
    } else if (producto.nivel_stock === 'Crítico') {
        return `⚠️ RESTOCK PRIORITARIO - Solo quedan ${producto.stock_actual} unidades (Prioridad: ${producto.prioridad})`;
    } else if (producto.nivel_stock === 'Bajo') {
        return `📋 PLANIFICAR RESTOCK - Stock bajo (${producto.stock_actual} unidades). Reabastecer ${producto.cantidad_sugerida_restock} unidades`;
    } else {
        return `✅ MONITOREAR - Stock adecuado por el momento`;
    }
}

// Endpoint para análisis de bajo stock con filtros por categoría
app.get('/api/productos/bajo-stock', async (req, res) => {
    try {
        const { categoria } = req.query; // Filtro por categoría: vacio, critico, bajo
        
        let whereCondition = '';
        let categoryFilter = '';
        
        // Definir filtros según la categoría solicitada
        if (categoria) {
            switch(categoria.toLowerCase()) {
                case 'vacio':
                    categoryFilter = "AND stock_actual = 0";
                    break;
                case 'critico':
                    categoryFilter = `AND stock_actual BETWEEN 1 AND 100 AND stock_actual > 0`;
                    break;
                case 'bajo':
                    categoryFilter = `AND stock_actual BETWEEN 100 AND 500`;
                    break;
                default:
                    categoryFilter = '';
            }
        }

        const [productos] = await pool.query(`
            SELECT 
                id,
                nombre,
                estado as categoria,
                stock_actual,
                punto_reorden,
                precio_actual,
                CASE 
                    WHEN stock_actual = 0 THEN 'vacio'
                    WHEN stock_actual BETWEEN 1 AND 100 THEN 'critico'
                    WHEN stock_actual BETWEEN 101 AND 500 THEN 'bajo'
                    ELSE 'normal'
                END as categoria_stock,
                CASE 
                    WHEN stock_actual = 0 THEN '#dc3545'  -- Rojo para vacío
                    WHEN stock_actual BETWEEN 1 AND 100 THEN '#fd7e14'  -- Naranja para crítico  
                    WHEN stock_actual BETWEEN 101 AND 500 THEN '#ffc107'  -- Amarillo para bajo
                    ELSE '#28a745'  -- Verde para normal
                END as color_nivel,
                -- Calcular porcentaje de criticidad
                CASE 
                    WHEN stock_actual = 0 THEN 100
                    WHEN stock_actual <= 50 THEN ROUND(((100 - stock_actual) / 100) * 100, 1)
                    WHEN stock_actual <= 100 THEN ROUND(((100 - stock_actual) / 100) * 80, 1)
                    WHEN stock_actual <= 300 THEN ROUND(((500 - stock_actual) / 400) * 60, 1)
                    ELSE 0
                END as porcentaje_criticidad,
                -- Recomendación de restock
                CASE 
                    WHEN stock_actual = 0 THEN 500
                    WHEN stock_actual <= 50 THEN 400
                    WHEN stock_actual <= 100 THEN 300
                    WHEN stock_actual <= 200 THEN 200
                    ELSE 150
                END as cantidad_sugerida_restock,
                -- Prioridad de reabastecimiento
                CASE 
                    WHEN stock_actual = 0 THEN 'URGENTE'
                    WHEN stock_actual <= 50 THEN 'ALTA'
                    WHEN stock_actual <= 100 THEN 'MEDIA-ALTA'
                    WHEN stock_actual <= 300 THEN 'MEDIA'
                    ELSE 'BAJA'
                END as prioridad
            FROM Productos 
            WHERE (
                stock_actual = 0 
                OR stock_actual BETWEEN 1 AND 500
            )
            AND stock_actual IS NOT NULL
            ${categoryFilter}
            ORDER BY 
                CASE 
                    WHEN stock_actual = 0 THEN 1
                    WHEN stock_actual BETWEEN 1 AND 50 THEN 2
                    WHEN stock_actual BETWEEN 51 AND 100 THEN 3
                    WHEN stock_actual BETWEEN 101 AND 300 THEN 4
                    ELSE 5
                END,
                stock_actual ASC,
                nombre ASC
            LIMIT 200
        `);

        // Agregar información adicional para el frontend
        const productosConInfo = productos.map(producto => ({
            ...producto,
            recomendacion_accion: getRecomendacionAccion(producto),
            dias_estimados_agotamiento: producto.stock_actual > 0 
                ? Math.ceil(producto.stock_actual / 3) // Estimación basada en venta promedio diaria
                : 0,
            costo_restock_estimado: producto.precio_actual ? 
                (producto.cantidad_sugerida_restock * producto.precio_actual * 0.7) : 0 // 70% del precio de venta
        }));
        
        // Calcular estadísticas por categoría
        const estadisticas = {
            vacio: productosConInfo.filter(p => p.categoria_stock === 'vacio').length,
            critico: productosConInfo.filter(p => p.categoria_stock === 'critico').length,
            bajo: productosConInfo.filter(p => p.categoria_stock === 'bajo').length,
            normal: productosConInfo.filter(p => p.categoria_stock === 'normal').length,
            total: productosConInfo.length
        };

        res.json({ 
            success: true, 
            productos: productosConInfo,
            estadisticas: estadisticas,
            filtro_aplicado: categoria || 'todos',
            resumen: {
                total_productos: productosConInfo.length,
                productos_vacios: estadisticas.vacio,
                productos_criticos: estadisticas.critico,
                productos_bajo_stock: estadisticas.bajo,
                productos_normales: estadisticas.normal,
                inversion_restock_total: productosConInfo.reduce((sum, p) => sum + (p.costo_restock_estimado || 0), 0)
            }
        });
    } catch (error) {
        console.error('Error al obtener productos con bajo stock:', error);
        res.status(500).json({ success: false, error: 'Error al obtener productos con bajo stock' });
    }
});

// Endpoint para obtener las categorías de stock disponibles
app.get('/api/productos/categorias-stock', async (req, res) => {
    try {
        const categorias = [
            {
                id: 'vacio',
                nombre: 'Vacío',
                descripcion: 'Productos completamente agotados (Stock = 0)',
                rango: '0 unidades',
                color: '#dc3545',
                icono: '🚨',
                prioridad: 1
            },
            {
                id: 'critico',
                nombre: 'Crítico',
                descripcion: 'Stock muy bajo, requiere atención inmediata',
                rango: '1 - 100 unidades',
                color: '#fd7e14',
                icono: '⚠️',
                prioridad: 2
            },
            {
                id: 'bajo',
                nombre: 'Bajo',
                descripcion: 'Stock bajo, planificar reabastecimiento',
                rango: '101 - 500 unidades',
                color: '#ffc107',
                icono: '📋',
                prioridad: 3
            }
        ];
        
        res.json({
            success: true,
            categorias: categorias,
            criterios: {
                vacio: { min: 0, max: 0 },
                critico: { min: 1, max: 100 },
                bajo: { min: 101, max: 500 }
            }
        });
    } catch (error) {
        console.error('Error al obtener categorías de stock:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener categorías de stock' 
        });
    }
});

// Endpoint para análisis de demanda
app.get('/api/productos/demanda', async (req, res) => {
    try {
        const [demanda] = await pool.query(`
            SELECT 
                p.id,
                p.nombre,
                p.precio_actual,
                p.stock_actual,
                COUNT(dt.id) as total_ventas,
                SUM(dt.cantidad) as unidades_vendidas,
                SUM(dt.cantidad * dt.precio_unitario_venta) as ingresos_totales,
                AVG(dt.cantidad) as promedio_por_venta,
                DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)) as dias_en_venta,
                ROUND(SUM(dt.cantidad) / NULLIF(DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)), 0), 2) as demanda_diaria,
                CASE 
                    WHEN SUM(dt.cantidad) / NULLIF(DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)), 0) > 5 THEN 'Alta'
                    WHEN SUM(dt.cantidad) / NULLIF(DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)), 0) > 2 THEN 'Media'
                    WHEN SUM(dt.cantidad) / NULLIF(DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)), 0) > 0 THEN 'Baja'
                    ELSE 'Nula'
                END as categoria_demanda,
                ROUND(p.stock_actual / NULLIF(SUM(dt.cantidad) / NULLIF(DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)), 0), 0), 1) as dias_stock_restante
            FROM Productos p
            LEFT JOIN DetalleTransaccion dt ON p.id = dt.producto_id
            LEFT JOIN Transacciones t ON dt.transaccion_id = t.id
            WHERE p.stock_actual IS NOT NULL
            GROUP BY p.id, p.nombre, p.precio_actual, p.stock_actual
            HAVING total_ventas > 0
            ORDER BY demanda_diaria DESC, unidades_vendidas DESC
            LIMIT 100
        `);
        res.json({ success: true, demanda });
    } catch (error) {
        console.error('Error al obtener análisis de demanda:', error);
        res.status(500).json({ success: false, error: 'Error al obtener análisis de demanda' });
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
        // Buscar patrones donde el producto actual aparece como producto_a o producto_b
        const [patronesResult] = await pool.query(`
          SELECT 
            CASE 
              WHEN pc.producto_a = ? THEN pc.producto_b 
              ELSE pc.producto_a 
            END AS producto_sugerido_id,
            pc.confianza,
            pc.lift,
            pc.soporte
          FROM PatronesCompra pc
          WHERE pc.producto_a = ? OR pc.producto_b = ?
          ORDER BY pc.confianza DESC, pc.lift DESC
          LIMIT 5
        `, [parseInt(productoId), parseInt(productoId), parseInt(productoId)]);
        
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
    
    // 2. INDICADOR BAJO STOCK: Criterio inteligente basado en categoría
    const categoria = producto.categoria || 'General';
    
    // Definir umbrales dinámicos según categoría
    let umbralCritico, umbralBajo;
    
    if (['Cocina', 'Hogar', 'Salud', 'Bebés'].includes(categoria)) {
      umbralCritico = 15;
      umbralBajo = 30;
    } else if (['Electrónicos', 'Deportes', 'Automotriz'].includes(categoria)) {
      umbralCritico = 10;
      umbralBajo = 25;
    } else if (['Libros', 'Películas', 'Música'].includes(categoria)) {
      umbralCritico = 5;
      umbralBajo = 15;
    } else if (['Arte', 'Joyería', 'Jardín'].includes(categoria)) {
      umbralCritico = 8;
      umbralBajo = 20;
    } else if (['Oficina', 'Herramientas', 'Juguetes'].includes(categoria)) {
      umbralCritico = 12;
      umbralBajo = 25;
    } else {
      // Fallback para categorías no especificadas o usar punto_reorden si existe
      umbralCritico = producto.punto_reorden ? producto.punto_reorden * 0.5 : 10;
      umbralBajo = producto.punto_reorden || 20;
    }
    
    // Evaluar nivel de stock
    if (producto.stock_actual === 0) {
      indicadores.bajo_stock = `🚨 AGOTADO: Producto sin existencias - RESTOCK URGENTE`;
    } else if (producto.stock_actual <= umbralCritico) {
      const diasEstimados = Math.ceil(producto.stock_actual / 2); // Estimación simple
      indicadores.bajo_stock = `🔴 CRÍTICO: Solo ${producto.stock_actual} unidades (≤${umbralCritico} para ${categoria}). Stock para ~${diasEstimados} días`;
    } else if (producto.stock_actual <= umbralBajo) {
      const porcentaje = Math.round((producto.stock_actual / umbralBajo) * 100);
      indicadores.bajo_stock = `⚠️ STOCK BAJO: ${producto.stock_actual} unidades (${porcentaje}% del óptimo para ${categoria})`;
    }
    
    // 3. INDICADOR DE DEMANDA: Análisis de ventas recientes
    try {
      const [demandaData] = await pool.query(`
        SELECT 
          COUNT(dt.id) as total_ventas,
          SUM(dt.cantidad) as unidades_vendidas,
          AVG(dt.cantidad) as promedio_por_venta,
          DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)) as dias_en_venta,
          SUM(dt.cantidad) / NULLIF(DATEDIFF(CURDATE(), MIN(t.fecha_transaccion)), 0) as demanda_diaria
        FROM DetalleTransaccion dt
        JOIN Transacciones t ON dt.transaccion_id = t.id
        WHERE dt.producto_id = ?
        AND t.fecha_transaccion >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `, [productoId]);
      
      if (demandaData.length > 0 && demandaData[0].total_ventas > 0) {
        const demanda = demandaData[0];
        const demandaDiaria = demanda.demanda_diaria || 0;
        const diasStockRestante = demandaDiaria > 0 ? Math.round(producto.stock_actual / demandaDiaria) : null;
        
        if (demandaDiaria > 5) {
          indicadores.demanda = `🔥 ALTA DEMANDA: ${demandaDiaria.toFixed(1)} unidades/día. Stock para ${diasStockRestante} días`;
        } else if (demandaDiaria > 2) {
          indicadores.demanda = `📈 Demanda media: ${demandaDiaria.toFixed(1)} unidades/día. Stock para ${diasStockRestante} días`;
        } else if (demandaDiaria > 0) {
          indicadores.demanda = `📊 Demanda baja: ${demandaDiaria.toFixed(1)} unidades/día. Stock suficiente`;
        } else {
          indicadores.demanda = `📉 Sin ventas recientes (últimos 30 días)`;
        }
      } else {
        indicadores.demanda = `📋 Producto nuevo o sin historial de ventas`;
      }
    } catch (demandaError) {
      console.error('Error al calcular demanda:', demandaError);
      indicadores.demanda = `⚠️ Error al calcular demanda`;
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
        p1.nombre as producto_a_nombre,
        p1.descripcion as producto_a_descripcion,
        p1.precio_actual as producto_a_precio,
        p2.nombre as producto_b_nombre,
        p2.descripcion as producto_b_descripcion,
        p2.precio_actual as producto_b_precio
      FROM PatronesCompra pc
      LEFT JOIN Productos p1 ON pc.producto_a = p1.id
      LEFT JOIN Productos p2 ON pc.producto_b = p2.id
      ORDER BY pc.confianza DESC, pc.lift DESC
    `);
    
    // Procesar los patrones para adaptarlos al nuevo formato
    const processedPatrones = patrones.map(patron => {
      return {
        ...patron,
        id: patron.patron_id,
        producto_a_id: patron.producto_a,
        producto_b_id: patron.producto_b,
        fecha_creacion: patron.fecha_calculo,
        // Mantener compatibilidad con el frontend
        antecedente_id: patron.producto_a,
        consecuente_id: patron.producto_b,
        producto_antecedente_nombre: patron.nombre_producto_a || patron.producto_a_nombre,
        producto_sugerido_nombre: patron.nombre_producto_b || patron.producto_b_nombre
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

// Función para generar PDF
function generarPDF(reporteData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // === ENCABEZADO PROFESIONAL ===
      // Fondo del encabezado
      doc.rect(0, 0, doc.page.width, 120)
         .fillAndStroke('#2E86AB', '#2E86AB');

      // Logo/Icono (simulado con texto estilizado)
      doc.fontSize(24)
         .fillColor('#FFFFFF')
         .text('📊', 60, 30);

      // Título principal
      doc.fontSize(28)
         .fillColor('#FFFFFF')
         .text('SISTEMA DE ANÁLISIS', 100, 25, { width: 400 });
      
      doc.fontSize(16)
         .text('Reporte de Gestión Comercial', 100, 55, { width: 400 });

      // Línea decorativa
      doc.rect(60, 90, doc.page.width - 120, 3)
         .fillAndStroke('#F18F01', '#F18F01');

      // === INFORMACIÓN DEL REPORTE ===
      doc.fillColor('#2C3E50');
      
      // Caja de información general
      const infoBoxY = 140;
      doc.rect(60, infoBoxY, doc.page.width - 120, 80)
         .fillAndStroke('#ECF0F1', '#BDC3C7');

      // Título del reporte específico
      doc.fontSize(22)
         .fillColor('#2E86AB')
         .text(`Reporte de ${reporteData.tipo.charAt(0).toUpperCase() + reporteData.tipo.slice(1)}`, 
                80, infoBoxY + 15, { align: 'center', width: doc.page.width - 160 });

      // Información del período con iconos
      doc.fontSize(12)
         .fillColor('#34495E')
         .text(`📅 Período: ${reporteData.periodo.desde} - ${reporteData.periodo.hasta}`, 80, infoBoxY + 45);
      
      doc.text(`🕒 Generado: ${new Date(reporteData.generado).toLocaleString('es-ES')}`, 80, infoBoxY + 60);

      doc.y = infoBoxY + 100;

      // === SECCIÓN DE RESUMEN ===
      if (reporteData.resumen) {
        doc.moveDown(1);
        
        // Título de sección con fondo
        doc.rect(60, doc.y, doc.page.width - 120, 25)
           .fillAndStroke('#3498DB', '#3498DB');
        
        doc.fontSize(16)
           .fillColor('#FFFFFF')
           .text('📈 RESUMEN EJECUTIVO', 70, doc.y - 20);

        doc.moveDown(1);
        
        // Crear tarjetas de métricas
        const metricas = [
          { label: 'Total Registros', valor: reporteData.resumen.total_registros, icono: '📋', color: '#E74C3C' },
          { label: 'Total Vendido', valor: reporteData.resumen.total_vendido, icono: '📦', color: '#27AE60' },
          { label: 'Ingresos Totales', valor: `$${parseFloat(reporteData.resumen.ingresos_totales || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}`, icono: '💰', color: '#F39C12' },
          { label: 'Transacciones', valor: reporteData.resumen.numero_transacciones, icono: '🛒', color: '#9B59B6' }
        ];

        if (reporteData.resumen.ticket_promedio) {
          metricas.push({ 
            label: 'Ticket Promedio', 
            valor: `$${parseFloat(reporteData.resumen.ticket_promedio || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}`, 
            icono: '💳', 
            color: '#1ABC9C' 
          });
        }

        // Distribuir métricas en filas de 2 columnas
        const metricasPerRow = 2;
        const cardWidth = (doc.page.width - 140) / metricasPerRow;
        const cardHeight = 60;

        for (let i = 0; i < metricas.length; i++) {
          const metrica = metricas[i];
          const row = Math.floor(i / metricasPerRow);
          const col = i % metricasPerRow;
          
          const x = 60 + (col * (cardWidth + 10));
          const y = doc.y + (row * (cardHeight + 10));

          // Tarjeta de métrica
          doc.rect(x, y, cardWidth, cardHeight)
             .fillAndStroke('#FFFFFF', metrica.color)
             .lineWidth(2);

          // Icono
          doc.fontSize(20)
             .fillColor(metrica.color)
             .text(metrica.icono, x + 10, y + 10);

          // Valor principal
          doc.fontSize(18)
             .fillColor('#2C3E50')
             .text(metrica.valor, x + 45, y + 8, { width: cardWidth - 55, align: 'left' });

          // Etiqueta
          doc.fontSize(10)
             .fillColor('#7F8C8D')
             .text(metrica.label, x + 45, y + 32, { width: cardWidth - 55, align: 'left' });
        }

        // Ajustar posición Y después de las tarjetas
        const totalRows = Math.ceil(metricas.length / metricasPerRow);
        doc.y += (totalRows * (cardHeight + 10)) + 20;
      }

      // === DATOS DETALLADOS ===
      if (reporteData.datos && reporteData.datos.length > 0) {
        // Verificar si necesitamos nueva página
        if (doc.y > 650) {
          doc.addPage();
          doc.y = 50;
        }

        // Título de sección
        doc.rect(60, doc.y, doc.page.width - 120, 25)
           .fillAndStroke('#E67E22', '#E67E22');
        
        doc.fontSize(16)
           .fillColor('#FFFFFF')
           .text('📊 DATOS DETALLADOS', 70, doc.y - 20);

        doc.moveDown(1.5);

        // Crear tabla estilizada
        const tableHeaders = [];
        const tableWidth = doc.page.width - 120;
        
        switch (reporteData.tipo) {
          case 'ventas':
            tableHeaders.push(
              { label: 'Fecha', width: tableWidth * 0.2 },
              { label: 'Vendido', width: tableWidth * 0.15 },
              { label: 'Ingresos', width: tableWidth * 0.2 },
              { label: 'Transacciones', width: tableWidth * 0.15 },
              { label: 'Ticket Prom.', width: tableWidth * 0.15 },
              { label: 'Productos Dif.', width: tableWidth * 0.15 }
            );
            break;
          case 'productos':
            tableHeaders.push(
              { label: 'Producto', width: tableWidth * 0.35 },
              { label: 'Categoría', width: tableWidth * 0.2 },
              { label: 'Vendido', width: tableWidth * 0.15 },
              { label: 'Ingresos', width: tableWidth * 0.15 },
              { label: 'Precio', width: tableWidth * 0.15 }
            );
            break;
          case 'categorias':
            tableHeaders.push(
              { label: 'Categoría', width: tableWidth * 0.3 },
              { label: 'Productos', width: tableWidth * 0.15 },
              { label: 'Vendido', width: tableWidth * 0.2 },
              { label: 'Ingresos', width: tableWidth * 0.2 },
              { label: 'Precio Prom.', width: tableWidth * 0.15 }
            );
            break;
        }

        // Dibujar encabezados de tabla
        let currentX = 60;
        const headerY = doc.y;
        
        tableHeaders.forEach(header => {
          doc.rect(currentX, headerY, header.width, 25)
             .fillAndStroke('#34495E', '#34495E');
          
          doc.fontSize(10)
             .fillColor('#FFFFFF')
             .text(header.label, currentX + 5, headerY + 8, { 
               width: header.width - 10, 
               align: 'center' 
             });
          
          currentX += header.width;
        });

        doc.y = headerY + 30;

        // Dibujar filas de datos (máximo 25 para no sobrecargar)
        const datosLimitados = reporteData.datos.slice(0, 25);
        let rowIndex = 0;
        
        datosLimitados.forEach((item, index) => {
          if (doc.y > 750) { // Nueva página si es necesario
            doc.addPage();
            doc.y = 50;
            
            // Redibujar encabezados en nueva página
            currentX = 60;
            const newHeaderY = doc.y;
            
            tableHeaders.forEach(header => {
              doc.rect(currentX, newHeaderY, header.width, 25)
                 .fillAndStroke('#34495E', '#34495E');
              
              doc.fontSize(10)
                 .fillColor('#FFFFFF')
                 .text(header.label, currentX + 5, newHeaderY + 8, { 
                   width: header.width - 10, 
                   align: 'center' 
                 });
              
              currentX += header.width;
            });
            
            doc.y = newHeaderY + 30;
          }

          const rowY = doc.y;
          const rowHeight = 20;
          
          // Alternar colores de fila
          const rowColor = index % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
          doc.rect(60, rowY, tableWidth, rowHeight)
             .fillAndStroke(rowColor, '#E0E0E0')
             .lineWidth(0.5);

          // Llenar datos de la fila
          currentX = 60;
          doc.fillColor('#2C3E50');
          
          switch (reporteData.tipo) {
            case 'ventas':
              const datosVenta = [
                item.fecha,
                item.total_vendido?.toLocaleString('es-ES') || '0',
                `$${parseFloat(item.ingresos_totales || 0).toLocaleString('es-ES')}`,
                item.numero_transacciones?.toLocaleString('es-ES') || '0',
                `$${parseFloat(item.precio_promedio || 0).toFixed(2)}`,
                item.productos_diferentes?.toLocaleString('es-ES') || '0'
              ];
              
              datosVenta.forEach((dato, i) => {
                doc.fontSize(8)
                   .text(dato, currentX + 3, rowY + 6, { 
                     width: tableHeaders[i].width - 6, 
                     align: i === 0 ? 'left' : 'center' 
                   });
                currentX += tableHeaders[i].width;
              });
              break;
              
            case 'productos':
              const datosProducto = [
                item.nombre?.substring(0, 30) + (item.nombre?.length > 30 ? '...' : '') || '',
                item.categoria || '',
                item.total_vendido?.toLocaleString('es-ES') || '0',
                `$${parseFloat(item.ingresos_totales || 0).toLocaleString('es-ES')}`,
                `$${parseFloat(item.precio_actual || 0).toFixed(2)}`
              ];
              
              datosProducto.forEach((dato, i) => {
                doc.fontSize(8)
                   .text(dato, currentX + 3, rowY + 6, { 
                     width: tableHeaders[i].width - 6, 
                     align: i === 0 ? 'left' : 'center' 
                   });
                currentX += tableHeaders[i].width;
              });
              break;
              
            case 'categorias':
              const datosCategoria = [
                item.categoria || '',
                item.cantidad_productos?.toLocaleString('es-ES') || '0',
                item.total_vendido?.toLocaleString('es-ES') || '0',
                `$${parseFloat(item.ingresos_totales || 0).toLocaleString('es-ES')}`,
                `$${parseFloat(item.precio_promedio || 0).toFixed(2)}`
              ];
              
              datosCategoria.forEach((dato, i) => {
                doc.fontSize(8)
                   .text(dato, currentX + 3, rowY + 6, { 
                     width: tableHeaders[i].width - 6, 
                     align: i === 0 ? 'left' : 'center' 
                   });
                currentX += tableHeaders[i].width;
              });
              break;
          }

          doc.y = rowY + rowHeight;
        });

        // Nota si hay más datos
        if (reporteData.datos.length > 25) {
          doc.moveDown(1);
          doc.fontSize(10)
             .fillColor('#7F8C8D')
             .text(`* Mostrando los primeros 25 registros de ${reporteData.datos.length} totales`, 60, doc.y, { align: 'center' });
        }
      }

      // === REPORTE COMPLETO - SECCIONES ADICIONALES ===
      if (reporteData.tipo === 'completo') {
        if (reporteData.topProductos && reporteData.topProductos.length > 0) {
          doc.addPage();
          doc.y = 50;
          
          // Título de sección
          doc.rect(60, doc.y, doc.page.width - 120, 25)
             .fillAndStroke('#8E44AD', '#8E44AD');
          
          doc.fontSize(16)
             .fillColor('#FFFFFF')
             .text('🏆 TOP PRODUCTOS', 70, doc.y - 20);

          doc.moveDown(1.5);

          // Crear ranking visual
          reporteData.topProductos.slice(0, 10).forEach((producto, index) => {
            const rankY = doc.y;
            const rankHeight = 35;
            
            // Medalla/posición
            const medallColor = index < 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][index] : '#95A5A6';
            doc.circle(80, rankY + 17, 15)
               .fillAndStroke(medallColor, '#34495E')
               .lineWidth(2);
            
            doc.fontSize(12)
               .fillColor('#FFFFFF')
               .text(`${index + 1}`, 75, rankY + 12);

            // Información del producto
            doc.rect(100, rankY, doc.page.width - 160, rankHeight)
               .fillAndStroke('#FFFFFF', '#BDC3C7')
               .lineWidth(1);

            doc.fontSize(12)
               .fillColor('#2C3E50')
               .text(producto.nombre?.substring(0, 50) + (producto.nombre?.length > 50 ? '...' : ''), 110, rankY + 5);
            
            doc.fontSize(10)
               .fillColor('#7F8C8D')
               .text(`Categoría: ${producto.categoria}`, 110, rankY + 18);

            // Métricas del producto
            doc.fontSize(10)
               .fillColor('#27AE60')
               .text(`Vendido: ${producto.total_vendido?.toLocaleString('es-ES')} unidades`, 350, rankY + 5);
            
            doc.fillColor('#E67E22')
               .text(`Ingresos: $${parseFloat(producto.ingresos_totales || 0).toLocaleString('es-ES')}`, 350, rankY + 18);

            doc.y = rankY + rankHeight + 5;
          });
        }

        if (reporteData.categorias && reporteData.categorias.length > 0) {
          doc.addPage();
          doc.y = 50;
          
          // Título de sección
          doc.rect(60, doc.y, doc.page.width - 120, 25)
             .fillAndStroke('#16A085', '#16A085');
          
          doc.fontSize(16)
             .fillColor('#FFFFFF')
             .text('📂 ANÁLISIS POR CATEGORÍAS', 70, doc.y - 20);

          doc.moveDown(1.5);

          // Gráfico de barras simple (representación visual)
          const maxIngresos = Math.max(...reporteData.categorias.map(c => parseFloat(c.ingresos_totales || 0)));
          const chartWidth = 300;
          const chartHeight = 200;
          const chartX = 60;
          const chartY = doc.y;

          // Marco del gráfico
          doc.rect(chartX, chartY, chartWidth, chartHeight)
             .stroke('#BDC3C7');

          // Barras del gráfico
          reporteData.categorias.slice(0, 8).forEach((categoria, index) => {
            const barHeight = (parseFloat(categoria.ingresos_totales || 0) / maxIngresos) * (chartHeight - 20);
            const barWidth = (chartWidth - 40) / Math.min(reporteData.categorias.length, 8);
            const barX = chartX + 20 + (index * barWidth);
            const barY = chartY + chartHeight - 10 - barHeight;

            // Barra
            const barColor = ['#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#95A5A6'][index % 8];
            doc.rect(barX + 2, barY, barWidth - 4, barHeight)
               .fillAndStroke(barColor, barColor);

            // Etiqueta de categoría (rotada)
            doc.save();
            doc.translate(barX + barWidth/2, chartY + chartHeight + 5);
            doc.rotate(-45);
            doc.fontSize(8)
               .fillColor('#2C3E50')
               .text(categoria.categoria?.substring(0, 8) || '', 0, 0);
            doc.restore();
          });

          // Tabla de datos de categorías
          doc.y = chartY + chartHeight + 40;
          
          doc.fontSize(12)
             .fillColor('#2C3E50')
             .text('Detalle por Categorías:', 60, doc.y);
          
          doc.moveDown(0.5);

          reporteData.categorias.forEach((categoria, index) => {
            const rowY = doc.y;
            const rowHeight = 25;
            
            // Fila alternada
            if (index % 2 === 0) {
              doc.rect(60, rowY, doc.page.width - 120, rowHeight)
                 .fillAndStroke('#F8F9FA', '#E0E0E0');
            }

            doc.fontSize(10)
               .fillColor('#2C3E50')
               .text(categoria.categoria, 70, rowY + 8)
               .text(`${categoria.total_vendido?.toLocaleString('es-ES')} unidades`, 200, rowY + 8)
               .text(`$${parseFloat(categoria.ingresos_totales || 0).toLocaleString('es-ES')}`, 350, rowY + 8)
               .text(`${categoria.cantidad_productos} productos`, 450, rowY + 8);

            doc.y = rowY + rowHeight;
          });
        }
      }

      // === PIE DE PÁGINA ===
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        
        // Pie de página
        doc.fontSize(8)
           .fillColor('#7F8C8D')
           .text(`Sistema de Análisis Comercial - Página ${i + 1} de ${pages.count}`, 
                  0, doc.page.height - 30, { align: 'center', width: doc.page.width });
        
        doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES')}`, 
                  0, doc.page.height - 20, { align: 'center', width: doc.page.width });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Función para generar Excel
async function generarExcel(reporteData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Análisis de Tienda';
  workbook.created = new Date();
  workbook.company = 'Gestión Comercial Inteligente';

  // === HOJA PRINCIPAL ===
  const worksheet = workbook.addWorksheet('Reporte Principal', {
    pageSetup: { 
      paperSize: 9, 
      orientation: 'landscape',
      fitToPage: true 
    }
  });

  // === ENCABEZADO PRINCIPAL ===
  // Combinar celdas para el título
  worksheet.mergeCells('A1:H2');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `📊 REPORTE DE ${reporteData.tipo.toUpperCase()}`;
  titleCell.font = { 
    size: 18, 
    bold: true, 
    color: { argb: 'FFFFFFFF' } 
  };
  titleCell.alignment = { 
    horizontal: 'center', 
    vertical: 'middle' 
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2E86AB' }
  };
  titleCell.border = {
    top: { style: 'thick', color: { argb: 'FF1F5F79' } },
    left: { style: 'thick', color: { argb: 'FF1F5F79' } },
    bottom: { style: 'thick', color: { argb: 'FF1F5F79' } },
    right: { style: 'thick', color: { argb: 'FF1F5F79' } }
  };

  // === INFORMACIÓN DEL REPORTE ===
  worksheet.mergeCells('A4:D4');
  const infoHeaderCell = worksheet.getCell('A4');
  infoHeaderCell.value = '📋 INFORMACIÓN DEL REPORTE';
  infoHeaderCell.font = { size: 14, bold: true, color: { argb: 'FF2C3E50' } };
  infoHeaderCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFECF0F1' }
  };

  // Detalles del reporte
  const infoRows = [
    ['📅 Período:', `${reporteData.periodo.desde} - ${reporteData.periodo.hasta}`],
    ['🕒 Generado:', new Date(reporteData.generado).toLocaleString('es-ES')],
    ['📊 Tipo de Reporte:', reporteData.tipo.charAt(0).toUpperCase() + reporteData.tipo.slice(1)],
    ['💻 Sistema:', 'Análisis Comercial Inteligente']
  ];

  infoRows.forEach((row, index) => {
    const rowNum = 5 + index;
    worksheet.getCell(`A${rowNum}`).value = row[0];
    worksheet.getCell(`A${rowNum}`).font = { bold: true, color: { argb: 'FF34495E' } };
    worksheet.getCell(`A${rowNum}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8F9FA' }
    };
    
    worksheet.getCell(`B${rowNum}`).value = row[1];
    worksheet.getCell(`B${rowNum}`).font = { color: { argb: 'FF2C3E50' } };
  });

  let currentRow = 10;

  // === SECCIÓN DE RESUMEN ===
  if (reporteData.resumen) {
    // Título de sección
    worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
    const resumenTitle = worksheet.getCell(`A${currentRow}`);
    resumenTitle.value = '📈 RESUMEN EJECUTIVO';
    resumenTitle.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    resumenTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    resumenTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3498DB' }
    };
    currentRow += 2;

    // Crear tarjetas de métricas en formato de tabla
    const metricas = [
      { 
        label: '📋 Total de Registros', 
        valor: reporteData.resumen.total_registros?.toLocaleString('es-ES') || '0',
        color: 'FFE74C3C',
        formato: '#,##0'
      },
      { 
        label: '📦 Total Vendido', 
        valor: reporteData.resumen.total_vendido?.toLocaleString('es-ES') || '0',
        color: 'FF27AE60',
        formato: '#,##0'
      },
      { 
        label: '💰 Ingresos Totales', 
        valor: parseFloat(reporteData.resumen.ingresos_totales || 0),
        color: 'FFF39C12',
        formato: '$#,##0.00'
      },
      { 
        label: '🛒 Número de Transacciones', 
        valor: reporteData.resumen.numero_transacciones?.toLocaleString('es-ES') || '0',
        color: 'FF9B59B6',
        formato: '#,##0'
      }
    ];

    if (reporteData.resumen.ticket_promedio) {
      metricas.push({ 
        label: '💳 Ticket Promedio', 
        valor: parseFloat(reporteData.resumen.ticket_promedio || 0),
        color: 'FF1ABC9C',
        formato: '$#,##0.00'
      });
    }

    // Encabezados de métricas
    const metricasHeaders = ['Métrica', 'Valor'];
    metricasHeaders.forEach((header, index) => {
      const cell = worksheet.getCell(`${String.fromCharCode(65 + index)}${currentRow}`);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF34495E' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    currentRow++;

    // Filas de métricas
    metricas.forEach((metrica, index) => {
      const labelCell = worksheet.getCell(`A${currentRow}`);
      const valueCell = worksheet.getCell(`B${currentRow}`);
      
      labelCell.value = metrica.label;
      labelCell.font = { bold: true, color: { argb: 'FF2C3E50' } };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8F9FA' }
      };
      
      if (typeof metrica.valor === 'number') {
        valueCell.value = metrica.valor;
        valueCell.numFmt = metrica.formato;
      } else {
        valueCell.value = metrica.valor;
      }
      
      valueCell.font = { bold: true, color: { argb: 'FF2C3E50' } };
      valueCell.alignment = { horizontal: 'center' };
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: metrica.color + '20' } // Color con transparencia
      };
      
      // Bordes
      [labelCell, valueCell].forEach(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBDC3C7' } },
          left: { style: 'thin', color: { argb: 'FFBDC3C7' } },
          bottom: { style: 'thin', color: { argb: 'FFBDC3C7' } },
          right: { style: 'thin', color: { argb: 'FFBDC3C7' } }
        };
      });
      
      currentRow++;
    });

    currentRow += 2; // Espacio
  }

  // === DATOS DETALLADOS ===
  if (reporteData.datos && reporteData.datos.length > 0) {
    // Título de sección
    worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
    const datosTitle = worksheet.getCell(`A${currentRow}`);
    datosTitle.value = '📊 DATOS DETALLADOS';
    datosTitle.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    datosTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    datosTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE67E22' }
    };
    currentRow += 2;

    // Definir headers según el tipo de reporte
    let headers = [];
    let headerFormats = [];
    
    switch (reporteData.tipo) {
      case 'ventas':
        headers = ['📅 Fecha', '🛒 Transacciones', '📦 Total Vendido', '💰 Ingresos Totales', '💵 Precio Promedio', '🎯 Productos Diferentes'];
        headerFormats = ['', '#,##0', '#,##0', '$#,##0.00', '$#,##0.00', '#,##0'];
        break;
      case 'productos':
        headers = ['🆔 ID', '🛍️ Nombre', '📂 Categoría', '💲 Precio Actual', '📦 Total Vendido', '💰 Ingresos Totales', '💵 Precio Promedio', '🛒 Transacciones', '📅 Primera Venta', '📅 Última Venta'];
        headerFormats = ['', '', '', '$#,##0.00', '#,##0', '$#,##0.00', '$#,##0.00', '#,##0', 'mm/dd/yyyy', 'mm/dd/yyyy'];
        break;
      case 'categorias':
        headers = ['📂 Categoría', '🎯 Cantidad Productos', '📦 Total Vendido', '💰 Ingresos Totales', '💵 Precio Promedio', '🛒 Transacciones'];
        headerFormats = ['', '#,##0', '#,##0', '$#,##0.00', '$#,##0.00', '#,##0'];
        break;
      default:
        headers = Object.keys(reporteData.datos[0] || {});
        headerFormats = new Array(headers.length).fill('');
    }

    // Crear encabezados con estilo
    headers.forEach((header, index) => {
      const cell = worksheet.getCell(`${String.fromCharCode(65 + index)}${currentRow}`);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF34495E' }
      };
      cell.border = {
        top: { style: 'thick', color: { argb: 'FF2C3E50' } },
        left: { style: 'thin', color: { argb: 'FF2C3E50' } },
        bottom: { style: 'thick', color: { argb: 'FF2C3E50' } },
        right: { style: 'thin', color: { argb: 'FF2C3E50' } }
      };
    });
    currentRow++;

    // Agregar datos con formato
    reporteData.datos.forEach((item, rowIndex) => {
      headers.forEach((header, colIndex) => {
        const cell = worksheet.getCell(`${String.fromCharCode(65 + colIndex)}${currentRow}`);
        
        // Obtener valor según el tipo de reporte
        let valor = '';
        const headerKey = header.replace(/[📅🛒📦💰💵🎯🆔🛍️📂💲📅]/g, '').trim().toLowerCase().replace(/\s+/g, '_');
        
        switch (reporteData.tipo) {
          case 'ventas':
            const fieldMap = {
              'fecha': item.fecha,
              'transacciones': item.numero_transacciones,
              'total_vendido': item.total_vendido,
              'ingresos_totales': item.ingresos_totales,
              'precio_promedio': item.precio_promedio,
              'productos_diferentes': item.productos_diferentes
            };
            valor = fieldMap[headerKey] || '';
            break;
          case 'productos':
            const prodFieldMap = {
              'id': item.producto_id || item.id,
              'nombre': item.nombre,
              'categoría': item.categoria,
              'precio_actual': item.precio_actual,
              'total_vendido': item.total_vendido,
              'ingresos_totales': item.ingresos_totales,
              'precio_promedio': item.precio_promedio,
              'transacciones': item.transacciones,
              'primera_venta': item.primera_venta,
              'última_venta': item.ultima_venta
            };
            valor = prodFieldMap[headerKey] || '';
            break;
          case 'categorias':
            const catFieldMap = {
              'categoría': item.categoria,
              'cantidad_productos': item.cantidad_productos,
              'total_vendido': item.total_vendido,
              'ingresos_totales': item.ingresos_totales,
              'precio_promedio': item.precio_promedio,
              'transacciones': item.transacciones
            };
            valor = catFieldMap[headerKey] || '';
            break;
          default:
            valor = item[headerKey] || item[header] || '';
        }

        // Asignar valor y formato
        if (typeof valor === 'number' && !isNaN(valor)) {
          cell.value = valor;
          if (headerFormats[colIndex]) {
            cell.numFmt = headerFormats[colIndex];
          }
        } else {
          cell.value = valor;
        }

        // Estilo de las celdas de datos
        cell.font = { color: { argb: 'FF2C3E50' } };
        cell.alignment = { 
          horizontal: colIndex === 1 ? 'left' : 'center', 
          vertical: 'middle' 
        };
        
        // Alternar colores de fila
        const bgColor = rowIndex % 2 === 0 ? 'FFFFFFFF' : 'FFF8F9FA';
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor }
        };
        
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });
      currentRow++;
    });

    // Aplicar filtros automáticos
    const dataRange = `A${currentRow - reporteData.datos.length - 1}:${String.fromCharCode(64 + headers.length)}${currentRow - 1}`;
    worksheet.autoFilter = dataRange;

    currentRow += 2;
  }

  // === HOJAS ADICIONALES PARA REPORTE COMPLETO ===
  if (reporteData.tipo === 'completo') {
    if (reporteData.topProductos && reporteData.topProductos.length > 0) {
      const productosSheet = workbook.addWorksheet('🏆 Top Productos', {
        pageSetup: { 
          paperSize: 9, 
          orientation: 'landscape' 
        }
      });
      
      // Título
      productosSheet.mergeCells('A1:F2');
      const prodTitle = productosSheet.getCell('A1');
      prodTitle.value = '🏆 TOP PRODUCTOS MÁS VENDIDOS';
      prodTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      prodTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      prodTitle.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8E44AD' }
      };

      // Encabezados
      const prodHeaders = ['🥇 Ranking', '🆔 ID', '🛍️ Producto', '📂 Categoría', '📦 Total Vendido', '💰 Ingresos Totales'];
      prodHeaders.forEach((header, index) => {
        const cell = productosSheet.getCell(`${String.fromCharCode(65 + index)}4`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF34495E' }
        };
        cell.border = {
          top: { style: 'thick' },
          left: { style: 'thin' },
          bottom: { style: 'thick' },
          right: { style: 'thin' }
        };
      });

      // Datos de productos
      reporteData.topProductos.forEach((producto, index) => {
        const row = index + 5;
        
        // Ranking con medallas
        const rankCell = productosSheet.getCell(`A${row}`);
        const medals = ['🥇', '🥈', '🥉'];
        rankCell.value = index < 3 ? medals[index] : `${index + 1}°`;
        rankCell.font = { bold: true, size: 12 };
        rankCell.alignment = { horizontal: 'center' };
        
        // Color especial para top 3
        if (index < 3) {
          rankCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: ['FFFFD700', 'FFC0C0C0', 'FFCD7F32'][index] }
          };
        }

        // Datos del producto
        const datos = [
          '',
          producto.producto_id,
          producto.nombre,
          producto.categoria,
          producto.total_vendido,
          producto.ingresos_totales
        ];

        datos.forEach((dato, colIndex) => {
          if (colIndex === 0) return; // Skip ranking column
          
          const cell = productosSheet.getCell(`${String.fromCharCode(65 + colIndex)}${row}`);
          cell.value = dato;
          
          if (colIndex === 4 || colIndex === 5) { // Números
            cell.numFmt = colIndex === 4 ? '#,##0' : '$#,##0.00';
            cell.alignment = { horizontal: 'center' };
          } else {
            cell.alignment = { horizontal: colIndex === 2 ? 'left' : 'center' };
          }
          
          // Alternar colores
          const bgColor = index % 2 === 0 ? 'FFFFFFFF' : 'FFF8F9FA';
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgColor }
          };
          
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
        });
      });

      // Auto-ajustar columnas
      productosSheet.columns.forEach((column, index) => {
        column.width = index === 2 ? 30 : 15; // Nombre del producto más ancho
      });
    }

    if (reporteData.categorias && reporteData.categorias.length > 0) {
      const categoriasSheet = workbook.addWorksheet('📂 Análisis por Categorías', {
        pageSetup: { 
          paperSize: 9, 
          orientation: 'landscape' 
        }
      });
      
      // Título
      categoriasSheet.mergeCells('A1:F2');
      const catTitle = categoriasSheet.getCell('A1');
      catTitle.value = '📂 ANÁLISIS DETALLADO POR CATEGORÍAS';
      catTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      catTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      catTitle.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF16A085' }
      };

      // Encabezados
      const catHeaders = ['📂 Categoría', '🎯 Cantidad Productos', '📦 Total Vendido', '💰 Ingresos Totales', '💵 Precio Promedio', '🛒 Transacciones'];
      catHeaders.forEach((header, index) => {
        const cell = categoriasSheet.getCell(`${String.fromCharCode(65 + index)}4`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF34495E' }
        };
        cell.border = {
          top: { style: 'thick' },
          left: { style: 'thin' },
          bottom: { style: 'thick' },
          right: { style: 'thin' }
        };
      });

      // Datos de categorías
      reporteData.categorias.forEach((categoria, index) => {
        const row = index + 5;
        
        const datos = [
          categoria.categoria,
          categoria.cantidad_productos,
          categoria.total_vendido,
          categoria.ingresos_totales,
          categoria.precio_promedio,
          categoria.transacciones
        ];

        datos.forEach((dato, colIndex) => {
          const cell = categoriasSheet.getCell(`${String.fromCharCode(65 + colIndex)}${row}`);
          cell.value = dato;
          
          // Formato para números
          if (colIndex > 0) {
            const formats = ['', '#,##0', '#,##0', '$#,##0.00', '$#,##0.00', '#,##0'];
            cell.numFmt = formats[colIndex];
            cell.alignment = { horizontal: 'center' };
          } else {
            cell.alignment = { horizontal: 'left' };
          }
          
          // Alternar colores
          const bgColor = index % 2 === 0 ? 'FFFFFFFF' : 'FFF8F9FA';
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgColor }
          };
          
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
        });
      });

      // Auto-ajustar columnas
      categoriasSheet.columns.forEach(column => {
        column.width = 18;
      });
    }
  }

  // === CONFIGURACIONES FINALES ===
  // Auto ajustar columnas en la hoja principal
  worksheet.columns.forEach((column, index) => {
    column.width = index === 1 ? 25 : 15; // Segunda columna más ancha
  });

  // Aplicar formato condicional para valores altos en métricas monetarias
  if (reporteData.datos && reporteData.datos.length > 0) {
    try {
      // Encontrar columnas de ingresos para formato condicional
      const ingresosCol = worksheet.getColumn('D'); // Asumiendo que ingresos están en columna D
      if (ingresosCol) {
        worksheet.addConditionalFormatting({
          ref: `D${10}:D${10 + reporteData.datos.length}`,
          rules: [
            {
              type: 'cellIs',
              operator: 'greaterThan',
              formulae: [1000],
              style: {
                fill: {
                  type: 'pattern',
                  pattern: 'solid',
                  bgColor: { argb: 'FF2ECC71' }
                },
                font: {
                  bold: true,
                  color: { argb: 'FFFFFFFF' }
                }
              }
            }
          ]
        });
      }
    } catch (error) {
      console.log('No se pudo aplicar formato condicional:', error.message);
    }
  }

  return workbook.xlsx.writeBuffer();
}

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
        
        // Generar respuesta según el formato solicitado para reporte completo
        if (formato === 'pdf') {
          try {
            const pdfBuffer = await generarPDF(reporteData);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte_completo_${desde}_${hasta}.pdf`);
            res.send(pdfBuffer);
          } catch (pdfError) {
            console.error('Error al generar PDF:', pdfError);
            res.status(500).json({
              success: false,
              error: 'Error al generar el reporte PDF',
              details: pdfError.message
            });
          }
        } else if (formato === 'excel' || formato === 'xlsx') {
          try {
            const excelBuffer = await generarExcel(reporteData);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=reporte_completo_${desde}_${hasta}.xlsx`);
            res.send(excelBuffer);
          } catch (excelError) {
            console.error('Error al generar Excel:', excelError);
            res.status(500).json({
              success: false,
              error: 'Error al generar el reporte Excel',
              details: excelError.message
            });
          }
        } else {
          // Formato JSON por defecto
          res.json(reporteData);
        }
        
        return;
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
    
    // Generar respuesta según el formato solicitado
    if (formato === 'pdf') {
      try {
        const pdfBuffer = await generarPDF(reporteData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=reporte_${tipo}_${desde}_${hasta}.pdf`);
        res.send(pdfBuffer);
      } catch (pdfError) {
        console.error('Error al generar PDF:', pdfError);
        res.status(500).json({
          success: false,
          error: 'Error al generar el reporte PDF',
          details: pdfError.message
        });
      }
    } else if (formato === 'excel' || formato === 'xlsx') {
      try {
        const excelBuffer = await generarExcel(reporteData);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=reporte_${tipo}_${desde}_${hasta}.xlsx`);
        res.send(excelBuffer);
      } catch (excelError) {
        console.error('Error al generar Excel:', excelError);
        res.status(500).json({
          success: false,
          error: 'Error al generar el reporte Excel',
          details: excelError.message
        });
      }
    } else {
      // Formato JSON por defecto
      res.json(reporteData);
    }
    
  } catch (error) {
    console.error('Error al generar reporte:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el reporte',
      details: error.message
    });
  }
});

// Endpoint para exportar productos de bajo stock
app.get('/api/productos/bajo-stock/export', async (req, res) => {
  try {
    const { categoria } = req.query;
    
    // Obtener datos usando la misma lógica del endpoint principal
    let whereConditions = ["p.estado = 'Activo'"];
    let params = [];
    
    // Aplicar filtros por categoría
    if (categoria) {
      switch (categoria) {
        case 'vacio':
          whereConditions.push('p.stock_actual = 0');
          break;
        case 'critico':
          whereConditions.push('p.stock_actual > 0 AND p.stock_actual <= 100');
          break;
        case 'bajo':
          whereConditions.push('p.stock_actual > 100 AND p.stock_actual <= 500');
          break;
      }
    } else {
      // Si no hay filtro, mostrar solo productos con stock bajo (<=500)
      whereConditions.push('p.stock_actual <= 500');
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    const query = `
      SELECT 
        p.id,
        p.nombre,
        p.categoria,
        p.stock_actual,
        p.punto_reorden,
        p.precio_actual,
        p.estado,
        CASE 
          WHEN p.stock_actual = 0 THEN 'vacio'
          WHEN p.stock_actual > 0 AND p.stock_actual <= 100 THEN 'critico'
          WHEN p.stock_actual > 100 AND p.stock_actual <= 500 THEN 'bajo'
          ELSE 'normal'
        END as categoria_stock,
        CASE 
          WHEN p.stock_actual = 0 THEN 'Reabastecer inmediatamente'
          WHEN p.stock_actual <= 50 THEN 'Stock muy bajo - Reabastecer pronto'
          WHEN p.stock_actual <= 100 THEN 'Monitorear stock de cerca'
          WHEN p.stock_actual <= 500 THEN 'Planificar próximo pedido'
          ELSE 'Stock normal'
        END as recomendacion
      FROM Productos p
      WHERE ${whereClause}
      ORDER BY p.stock_actual ASC, p.nombre ASC
    `;
    
    const [productos] = await pool.query(query, params);
    
    // Configurar headers para descarga CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="productos_bajo_stock_${Date.now()}.csv"`);
    
    // Crear CSV
    let csvContent = 'ID,Nombre,Categoria,Stock_Actual,Punto_Reorden,Precio,Estado,Nivel_Stock,Recomendacion\n';
    
    productos.forEach(producto => {
      csvContent += [
        producto.id,
        `"${producto.nombre.replace(/"/g, '""')}"`,
        `"${producto.categoria || 'Sin categoría'}"`,
        producto.stock_actual,
        producto.punto_reorden,
        producto.precio_actual,
        producto.estado,
        producto.categoria_stock.toUpperCase(),
        `"${producto.recomendacion.replace(/"/g, '""')}"`
      ].join(',') + '\n';
    });
    
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error al exportar datos de stock:', error);
    res.status(500).json({
      success: false,
      error: 'Error al exportar datos',
      details: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de análisis de datos funcionando en puerto ${PORT}`);
  console.log(`Visita http://localhost:${PORT} para acceder a las gráficas`);
});