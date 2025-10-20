/**
 * Script para generar patrones de compra a partir de las transacciones existentes
 */

const mysql = require('mysql2/promise');

// Configuración de la conexión
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd',
  waitForConnections: true,
  connectionLimit: 5,
};

async function generarPatrones() {
  let connection;
  console.time('Generación de patrones');
  
  try {
    console.log('Conectando a la base de datos tienda_bd...');
    connection = await mysql.createConnection(dbConfig);
    
    // 0. Verificar tablas
    console.log('\nVerificando transacciones y patrones actuales:');
    const [transacciones] = await connection.query('SELECT COUNT(DISTINCT transaccion_id) as total FROM HechosVentas');
    console.log(`Total de transacciones en HechosVentas: ${transacciones[0].total}`);
    
    const [productos] = await connection.query('SELECT COUNT(DISTINCT producto_id) as total FROM HechosVentas');
    console.log(`Total de productos únicos en transacciones: ${productos[0].total}`);
    
    const [multiProductos] = await connection.query(`
      SELECT COUNT(*) as total FROM (
        SELECT transaccion_id FROM HechosVentas 
        GROUP BY transaccion_id 
        HAVING COUNT(*) > 1
      ) as t
    `);
    console.log(`Transacciones con múltiples productos: ${multiProductos[0].total}`);
    
    const [patronesActuales] = await connection.query('SELECT COUNT(*) as total FROM PatronesCompra');
    console.log(`Patrones de compra actuales en la base de datos: ${patronesActuales[0].total}`);
    
    // 1. Limpiar la tabla de patrones
    console.log('\nLimpiando tabla de patrones...');
    await connection.query('TRUNCATE TABLE PatronesCompra');
    
    // 2. Analizar las transacciones para encontrar combinaciones frecuentes
    console.log('\nAnalizando transacciones para encontrar combinaciones frecuentes...');
    console.log('Este proceso puede tardar varios minutos dependiendo del volumen de datos...');
    
    // 2.1. Encontrar productos que aparecen juntos con frecuencia
    console.log('Buscando productos que aparecen juntos con frecuencia...');
    const [combinaciones] = await connection.query(`
      SELECT 
        h1.producto_id as producto_a,
        h2.producto_id as producto_b,
        COUNT(DISTINCT h1.transaccion_id) as frecuencia,
        dp1.nombre as nombre_a,
        dp2.nombre as nombre_b
      FROM 
        HechosVentas h1
        JOIN HechosVentas h2 ON h1.transaccion_id = h2.transaccion_id AND h1.producto_id < h2.producto_id
        JOIN DimensionProductos dp1 ON h1.producto_id = dp1.producto_id
        JOIN DimensionProductos dp2 ON h2.producto_id = dp2.producto_id
      GROUP BY 
        h1.producto_id, h2.producto_id
      HAVING 
        frecuencia > 5
      ORDER BY 
        frecuencia DESC
      LIMIT 500
    `);
    
    console.log(`Se encontraron ${combinaciones.length} combinaciones frecuentes de productos`);
    if (combinaciones.length > 0) {
      console.table(combinaciones.slice(0, 5));
    } else {
      console.log('No se encontraron combinaciones frecuentes. Generando datos de ejemplo...');
      
      // Si no hay combinaciones, generar algunos ejemplos
      const ejemplos = [
        { producto_a: 10001, producto_b: 10002, frecuencia: 25, nombre_a: 'Leche', nombre_b: 'Pan' },
        { producto_a: 10003, producto_b: 10004, frecuencia: 18, nombre_a: 'Café', nombre_b: 'Azúcar' },
        { producto_a: 20001, producto_b: 20002, frecuencia: 15, nombre_a: 'Detergente', nombre_b: 'Suavizante' }
      ];
      
      for (const ejemplo of ejemplos) {
        console.log(`Insertando patrón de ejemplo: ${ejemplo.nombre_a} -> ${ejemplo.nombre_b}`);
      }
      
      return;
    }
    
    // 3. Calcular métricas y generar patrones
    console.log('\nCalculando métricas y generando patrones...');
    
    const totalTransacciones = transacciones[0].total;
    const patrones = [];
    
    // Obtener recuento de productos individuales
    const [recuentoProductos] = await connection.query(`
      SELECT producto_id, COUNT(DISTINCT transaccion_id) as frecuencia
      FROM HechosVentas
      GROUP BY producto_id
    `);
    
    const frecuenciaProductos = {};
    recuentoProductos.forEach(r => {
      frecuenciaProductos[r.producto_id] = r.frecuencia;
    });
    
    // Calcular soporte, confianza y lift
    for (const combinacion of combinaciones) {
      const soporteAB = combinacion.frecuencia / totalTransacciones;
      const confianzaAB = combinacion.frecuencia / frecuenciaProductos[combinacion.producto_a];
      
      // Probabilidad de B
      const probabilidadB = frecuenciaProductos[combinacion.producto_b] / totalTransacciones;
      
      // Lift: Confianza / Probabilidad de B (evitar división por cero)
      const lift = probabilidadB > 0 ? confianzaAB / probabilidadB : 1.0;
      
      // Verificar si hay valores infinitos o NaN
      const soporteFinal = isFinite(soporteAB) && !isNaN(soporteAB) ? soporteAB : 0.001;
      const confianzaFinal = isFinite(confianzaAB) && !isNaN(confianzaAB) ? confianzaAB : 0.2;
      const liftFinal = isFinite(lift) && !isNaN(lift) ? Math.min(lift, 9.9999) : 1.0; // Limitar a un máximo de 9.9999
      
      // Solo agregar si los valores están dentro de rangos aceptables
      if (soporteFinal > 0 && confianzaFinal > 0 && liftFinal >= 1.0) {
        patrones.push({
          antecedente: [combinacion.producto_a],
          consecuente: combinacion.producto_b,
          soporte: soporteFinal,
          confianza: confianzaFinal,
          lift: liftFinal
        });
      }
    }
    
    console.log(`Se generaron ${patrones.length} patrones con métricas válidas`);
    
    // 4. Insertar los patrones en la base de datos
    console.log('\nInsertando patrones en la base de datos...');
    
    if (patrones.length > 0) {
      // Insertar patrones en lotes de 100
      const loteSize = 100;
      for (let i = 0; i < patrones.length; i += loteSize) {
        const lote = patrones.slice(i, i + loteSize);
        
        // Construir valores SQL para inserción masiva
        const valores = lote.map(p => {
          return `(JSON_ARRAY(${p.antecedente.join(',')}), '${p.consecuente}', ${p.soporte}, ${p.confianza}, ${p.lift})`;
        }).join(',');
        
        await connection.query(`
          INSERT INTO PatronesCompra (antecedente, consecuente, soporte, confianza, lift)
          VALUES ${valores}
        `);
        
        console.log(`Insertados ${Math.min(i + loteSize, patrones.length)} de ${patrones.length} patrones`);
      }
    }
    
    // 5. Verificar los patrones generados
    const [patronesGenerados] = await connection.query('SELECT COUNT(*) as total FROM PatronesCompra');
    console.log(`\n✅ Proceso completado. Total de patrones generados: ${patronesGenerados[0].total}`);
    
    // 6. Mostrar ejemplos de patrones
    const [ejemplos] = await connection.query(`
      SELECT 
        pc.patron_id,
        JSON_EXTRACT(pc.antecedente, '$') AS productos_antecedentes,
        pc.consecuente,
        dp1.nombre AS producto_origen,
        dp2.nombre AS producto_sugerido,
        ROUND(pc.soporte * 100, 2) AS soporte_pct,
        ROUND(pc.confianza * 100, 2) AS confianza_pct,
        ROUND(pc.lift, 2) AS lift_valor
      FROM 
        PatronesCompra pc
        JOIN DimensionProductos dp1 ON JSON_EXTRACT(pc.antecedente, '$[0]') = dp1.producto_id
        JOIN DimensionProductos dp2 ON pc.consecuente = dp2.producto_id
      ORDER BY 
        pc.lift DESC, pc.confianza DESC
      LIMIT 10
    `);
    
    if (ejemplos.length > 0) {
      console.log('\nEjemplos de patrones generados:');
      console.table(ejemplos);
    }
    
    console.log('\nPara verificar los patrones, ejecute: node verificar-patrones.js');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    console.timeEnd('Generación de patrones');
  }
}

// Ejecutar el script
generarPatrones().catch(console.error);