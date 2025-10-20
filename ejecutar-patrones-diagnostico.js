/**
 * Script para diagnosticar y ejecutar el procedimiento CalcularPatronesCompra
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

async function diagnosticarPatrones() {
  let connection;
  console.time('Diagnóstico de patrones');
  
  try {
    console.log('Conectando a la base de datos tienda_bd...');
    connection = await mysql.createConnection(dbConfig);
    
    // Verificar nombres de columnas en HechosVentas
    console.log('\n1. Verificando estructura de tabla HechosVentas:');
    const [columnas] = await connection.query('SHOW COLUMNS FROM HechosVentas');
    console.log('Columnas en HechosVentas:');
    console.table(columnas.map(col => ({ Field: col.Field, Type: col.Type })));
    
    // Verificar si hay transacciones con múltiples productos
    console.log('\n2. Verificando transacciones con múltiples productos:');
    const [transacciones] = await connection.query(`
      SELECT 
        transaccion_id, 
        COUNT(*) as productos_por_transaccion
      FROM HechosVentas 
      GROUP BY transaccion_id 
      HAVING COUNT(*) > 1
    `);
    
    console.log(`Transacciones con múltiples productos: ${transacciones.length}`);
    if (transacciones.length > 0) {
      console.log('Ejemplos de transacciones (Top 5):');
      console.table(transacciones.slice(0, 5));
    }
    
    // Verificar si la función JSON_ARRAYAGG está disponible
    console.log('\n3. Verificando la disponibilidad de JSON_ARRAYAGG:');
    try {
      const [jsonTest] = await connection.query(`
        SELECT JSON_ARRAYAGG(producto_id) as json_test 
        FROM HechosVentas 
        LIMIT 1
      `);
      console.log('✅ JSON_ARRAYAGG funciona correctamente');
      console.log('Ejemplo:', jsonTest[0].json_test);
    } catch (err) {
      console.log('❌ Error con JSON_ARRAYAGG:', err.message);
    }
    
    // Probar la consulta principal del procedimiento
    console.log('\n4. Probando la consulta principal (sin filtros):');
    try {
      const [antecedentes] = await connection.query(`
        WITH Antecedentes AS (
          SELECT transaccion_id, JSON_ARRAYAGG(producto_id) AS ante_array
          FROM HechosVentas
          GROUP BY transaccion_id
          HAVING COUNT(*) > 1
        )
        SELECT COUNT(*) as total_combinaciones
        FROM Antecedentes a
        LEFT JOIN HechosVentas b ON a.transaccion_id = b.transaccion_id
        GROUP BY a.ante_array, b.producto_id
      `);
      
      console.log(`✅ La consulta principal genera ${antecedentes[0]?.total_combinaciones || 0} combinaciones`);
    } catch (err) {
      console.log('❌ Error en consulta principal:', err.message);
    }
    
    // Probar la consulta completa con filtros
    console.log('\n5. Probando la consulta completa (con filtros):');
    try {
      const [patrones] = await connection.query(`
        WITH Antecedentes AS (
          SELECT transaccion_id, JSON_ARRAYAGG(producto_id) AS ante_array
          FROM HechosVentas
          GROUP BY transaccion_id
          HAVING COUNT(*) > 1
        )
        SELECT COUNT(*) as patrones_encontrados
        FROM (
          SELECT 
            a.ante_array AS antecedente,
            b.producto_id AS consecuente,
            COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / COUNT(DISTINCT a.transaccion_id) AS soporte,
            COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / COUNT(DISTINCT a.transaccion_id) AS confianza,
            (COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / COUNT(DISTINCT a.transaccion_id)) / 
            (COUNT(DISTINCT b.transaccion_id) / (SELECT COUNT(DISTINCT transaccion_id) FROM HechosVentas)) AS lift
          FROM Antecedentes a
          LEFT JOIN HechosVentas b ON a.transaccion_id = b.transaccion_id
          GROUP BY a.ante_array, b.producto_id
          HAVING soporte > 0.01 AND confianza > 0.5 AND lift > 1
        ) as patrones_filtrados
      `);
      
      console.log(`✅ Patrones significativos encontrados: ${patrones[0]?.patrones_encontrados || 0}`);
      
      if (patrones[0]?.patrones_encontrados === 0) {
        console.log('\n⚠️ No se encontraron patrones significativos con los umbrales actuales.');
        console.log('Intentando con umbrales más bajos:');
        
        const [patronesReducidos] = await connection.query(`
          WITH Antecedentes AS (
            SELECT transaccion_id, JSON_ARRAYAGG(producto_id) AS ante_array
            FROM HechosVentas
            GROUP BY transaccion_id
            HAVING COUNT(*) > 1
          )
          SELECT COUNT(*) as patrones_encontrados
          FROM (
            SELECT 
              a.ante_array AS antecedente,
              b.producto_id AS consecuente,
              COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / COUNT(DISTINCT a.transaccion_id) AS soporte,
              COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / COUNT(DISTINCT a.transaccion_id) AS confianza,
              (COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / COUNT(DISTINCT a.transaccion_id)) / 
              (COUNT(DISTINCT b.transaccion_id) / (SELECT COUNT(DISTINCT transaccion_id) FROM HechosVentas)) AS lift
            FROM Antecedentes a
            LEFT JOIN HechosVentas b ON a.transaccion_id = b.transaccion_id
            GROUP BY a.ante_array, b.producto_id
            HAVING soporte > 0.001 AND confianza > 0.2 AND lift > 1
          ) as patrones_filtrados
        `);
        
        console.log(`Patrones con umbrales reducidos: ${patronesReducidos[0]?.patrones_encontrados || 0}`);
        
        if (patronesReducidos[0]?.patrones_encontrados > 0) {
          console.log('\n👉 Se recomienda modificar los umbrales en el procedimiento almacenado:');
          console.log('   - Reducir soporte a 0.001 (actualmente 0.01)');
          console.log('   - Reducir confianza a 0.2 (actualmente 0.5)');
        } else {
          console.log('\n❓ Posibles razones por las que no se generan patrones:');
          console.log('   1. No hay suficientes transacciones con los mismos productos');
          console.log('   2. Los datos de compra no muestran patrones significativos');
          console.log('   3. La distribución de productos es demasiado diversa');
          console.log('   4. Podría ser necesario generar más datos de ventas con los nuevos productos');
        }
      }
    } catch (err) {
      console.log('❌ Error en consulta completa:', err.message);
    }
    
    // Ejecutar el procedimiento almacenado
    console.log('\n6. ¿Desea ejecutar el procedimiento CalcularPatronesCompra? (S/N)');
    console.log('Para ejecutarlo con los umbrales actuales, use:');
    console.log('mysql -u root -p tienda_bd -e "CALL CalcularPatronesCompra();"');
    
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    console.timeEnd('Diagnóstico de patrones');
  }
}

// Ejecutar
diagnosticarPatrones().catch(console.error);