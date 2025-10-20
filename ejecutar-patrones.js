/**
 * Script para ejecutar el procedimiento almacenado CalcularPatronesCompra
 * Esto analizará los datos en HechosVentas y generará patrones de compra
 * 
 * Uso: node ejecutar-patrones.js
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

async function ejecutarPatrones() {
  let connection;
  console.time('Patrones de compra');
  
  try {
    console.log('Conectando a la base de datos tienda_bd...');
    connection = await mysql.createConnection(dbConfig);
    
    // Verificar si existe la tabla PatronesCompra
    console.log('\nVerificando tabla PatronesCompra:');
    const [tablaResult] = await connection.query(`
      SELECT COUNT(*) AS existe 
      FROM information_schema.tables
      WHERE table_schema = 'tienda_bd' 
      AND table_name = 'PatronesCompra'
    `);
    
    if (tablaResult[0].existe === 0) {
      console.log('❌ La tabla PatronesCompra no existe.');
      console.log('Ejecute primero el archivo PatronesDeCompra.sql para crear la tabla y el procedimiento.');
      return;
    }
    
    // Verificar si existe el procedimiento
    const [procResult] = await connection.query(`
      SELECT COUNT(*) AS existe 
      FROM information_schema.routines
      WHERE routine_schema = 'tienda_bd' 
      AND routine_name = 'CalcularPatronesCompra'
    `);
    
    if (procResult[0].existe === 0) {
      console.log('❌ El procedimiento CalcularPatronesCompra no existe.');
      console.log('Ejecute primero el archivo PatronesDeCompra.sql para crear la tabla y el procedimiento.');
      return;
    }
    
    // Contar registros actuales en PatronesCompra
    const [countBefore] = await connection.query('SELECT COUNT(*) AS total FROM PatronesCompra');
    console.log(`Patrones de compra actuales: ${countBefore[0].total}`);
    
    // Ejecutar el procedimiento
    console.log('\n=== EJECUTANDO PROCEDIMIENTO ALMACENADO CalcularPatronesCompra ===');
    console.log('Este proceso puede tardar varios minutos dependiendo del volumen de datos...');
    console.log('Por favor espere...');
    
    await connection.query('CALL CalcularPatronesCompra()');
    
    // Contar registros después de la ejecución
    const [countAfter] = await connection.query('SELECT COUNT(*) AS total FROM PatronesCompra');
    console.log(`\n✅ Procedimiento ejecutado exitosamente!`);
    console.log(`Patrones de compra generados: ${countAfter[0].total} (${countAfter[0].total - countBefore[0].total} nuevos patrones)`);
    
    // Mostrar algunos ejemplos
    if (countAfter[0].total > 0) {
      const [patrones] = await connection.query(`
        SELECT 
          JSON_EXTRACT(pc.antecedente, '$') AS productos_origen,
          pc.consecuente AS producto_sugerido,
          ROUND(pc.soporte * 100, 2) AS soporte_pct,
          ROUND(pc.confianza * 100, 2) AS confianza_pct,
          ROUND(pc.lift, 2) AS lift
        FROM PatronesCompra pc
        ORDER BY pc.confianza DESC, pc.lift DESC
        LIMIT 5
      `);
      
      console.log('\nEjemplos de patrones encontrados:');
      console.table(patrones);
    }
    
    console.log('\nPara ver todos los patrones, ejecute:');
    console.log('node verificar-patrones.js');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\nConexión cerrada.');
    }
    console.timeEnd('Patrones de compra');
  }
}

// Ejecutar
ejecutarPatrones().catch(console.error);