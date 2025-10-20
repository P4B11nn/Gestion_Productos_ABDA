/**
 * Script para visualización de datos históricos de ventas y precios
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Configurar conexión a la base de datos
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Endpoint para obtener datos históricos de ventas y precios de un producto
router.get('/api/productos/:id/historico', async (req, res) => {
  try {
    const productoId = req.params.id;
    const periodos = req.query.periodos || 6; // Por defecto 6 periodos
    
    // Verificar qué modelo de datos está disponible
    const [tablesCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tienda_bd' 
      AND table_name IN ('DimensionProductos', 'HechosVentas', 'DimensionFechas', 'Transacciones', 'DetalleTransaccion')
    `);
    
    const tablasDisponibles = tablesCheck.map(t => t.table_name.toLowerCase());
    
    // Verificar si existe el producto
    let productoQuery;
    let tablasProducto;
    
    if (tablasDisponibles.includes('dimensionproductos')) {
      productoQuery = `SELECT producto_id, nombre FROM DimensionProductos WHERE producto_id = ?`;
      tablasProducto = 'dimensional';
    } else {
      productoQuery = `SELECT id as producto_id, nombre FROM Productos WHERE id = ?`;
      tablasProducto = 'transaccional';
    }
    
    const [productoCheck] = await pool.query(productoQuery, [productoId]);
    
    if (productoCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }
    
    const nombreProducto = productoCheck[0].nombre;
    
    // Datos para respuesta
    const resultado = {
      success: true,
      producto: {
        id: productoId,
        nombre: nombreProducto
      },
      ventasPorPeriodo: [],
      preciosPorPeriodo: []
    };
    
    // Obtener datos históricos según el modelo disponible
    if (tablasProducto === 'dimensional' && 
        tablasDisponibles.includes('hechosventas') && 
        tablasDisponibles.includes('dimensionfechas')) {
      // Usar modelo dimensional
      
      // 1. Datos de ventas por periodo (últimos X meses/trimestres)
      const [ventasData] = await pool.query(`
        SELECT 
          DATE_FORMAT(df.fecha, '%Y-%m') as periodo,
          SUM(hv.cantidad_vendida) as unidades_vendidas,
          SUM(hv.cantidad_vendida * hv.precio_unitario) as total_ventas,
          COUNT(DISTINCT hv.transaccion_id) as num_transacciones
        FROM HechosVentas hv
        JOIN DimensionFechas df ON hv.fecha_id = df.fecha_id
        WHERE hv.producto_id = ?
        GROUP BY DATE_FORMAT(df.fecha, '%Y-%m')
        ORDER BY periodo DESC
        LIMIT ?
      `, [productoId, periodos]);
      
      resultado.ventasPorPeriodo = ventasData.reverse(); // Orden cronológico
      
      // 2. Evolución de precios
      const [preciosData] = await pool.query(`
        SELECT 
          DATE_FORMAT(df.fecha, '%Y-%m') as periodo,
          AVG(hv.precio_unitario) as precio_promedio,
          MIN(hv.precio_unitario) as precio_minimo,
          MAX(hv.precio_unitario) as precio_maximo
        FROM HechosVentas hv
        JOIN DimensionFechas df ON hv.fecha_id = df.fecha_id
        WHERE hv.producto_id = ?
        GROUP BY DATE_FORMAT(df.fecha, '%Y-%m')
        ORDER BY periodo DESC
        LIMIT ?
      `, [productoId, periodos]);
      
      resultado.preciosPorPeriodo = preciosData.reverse(); // Orden cronológico
      
    } else if (tablasDisponibles.includes('transacciones') && 
               tablasDisponibles.includes('detalletransaccion')) {
      // Usar modelo transaccional
      
      // 1. Datos de ventas por periodo (últimos X meses)
      const [ventasData] = await pool.query(`
        SELECT 
          DATE_FORMAT(t.fecha_transaccion, '%Y-%m') as periodo,
          SUM(dt.cantidad) as unidades_vendidas,
          SUM(dt.cantidad * dt.precio_unitario_venta) as total_ventas,
          COUNT(DISTINCT t.id) as num_transacciones
        FROM DetalleTransaccion dt
        JOIN Transacciones t ON dt.transaccion_id = t.id
        WHERE dt.producto_id = ?
        GROUP BY DATE_FORMAT(t.fecha_transaccion, '%Y-%m')
        ORDER BY periodo DESC
        LIMIT ?
      `, [productoId, periodos]);
      
      resultado.ventasPorPeriodo = ventasData.reverse(); // Orden cronológico
      
      // 2. Evolución de precios
      const [preciosData] = await pool.query(`
        SELECT 
          DATE_FORMAT(t.fecha_transaccion, '%Y-%m') as periodo,
          AVG(dt.precio_unitario_venta) as precio_promedio,
          MIN(dt.precio_unitario_venta) as precio_minimo,
          MAX(dt.precio_unitario_venta) as precio_maximo
        FROM DetalleTransaccion dt
        JOIN Transacciones t ON dt.transaccion_id = t.id
        WHERE dt.producto_id = ?
        GROUP BY DATE_FORMAT(t.fecha_transaccion, '%Y-%m')
        ORDER BY periodo DESC
        LIMIT ?
      `, [productoId, periodos]);
      
      resultado.preciosPorPeriodo = preciosData.reverse(); // Orden cronológico
    } else {
      // No hay datos históricos disponibles
      resultado.error = "No se encontraron tablas con datos históricos";
    }
    
    res.json(resultado);
    
  } catch (error) {
    console.error('Error al obtener datos históricos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la solicitud',
      details: error.message
    });
  }
});

module.exports = router;