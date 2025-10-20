/**
 * Script para crear solo las tablas dimensionales necesarias
 * Uso: node ejecutar-dimensiones.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Configuración de conexión
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd',
  waitForConnections: true,
  connectionLimit: 5,
  multipleStatements: true // Importante para ejecutar múltiples consultas
};

async function ejecutarSetupDimensional() {
  let connection;
  
  try {
    console.log('Conectando a la base de datos...');
    connection = await mysql.createConnection(dbConfig);
    
    // Verificar tablas existentes
    const [tablesExist] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tienda_bd' 
      AND table_name IN ('Productos', 'Clientes', 'Transacciones', 'DetalleTransaccion')
    `);
    
    const foundTables = tablesExist.map(t => t.table_name);
    if (foundTables.length < 4) {
      console.log('⚠️ Advertencia: Algunas tablas operacionales no existen.');
      console.log(`Tablas encontradas: ${foundTables.join(', ')}`);
    }
    
    // 1. Crear las tablas dimensionales
    console.log('Creando tablas dimensionales...');
    const sqlFile = fs.readFileSync(path.join(__dirname, 'crear-tablas-dimensionales.sql'), 'utf8');
    
    // Ejecutar por partes para mejor control
    const statements = sqlFile.split(';');
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }
    
    console.log('✅ Tablas dimensionales creadas exitosamente');
    
    // 2. Verificar la existencia de las tablas
    console.log('\nVerificando las tablas dimensionales...');
    const [dimensionTables] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tienda_bd' 
      AND table_name IN ('DimensionProductos', 'HechosVentas', 'DimensionClientes', 'DimensionFechas')
    `);
    
    const foundDimTables = dimensionTables.map(t => t.table_name);
    console.log('Tablas dimensionales encontradas:', foundDimTables.join(', '));
    
    // 3. Verificar si hay datos
    for (const table of foundDimTables) {
      const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`${table}: ${countResult[0].count} registros`);
    }
    
    // 4. Ejecutar el procedimiento para calcular patrones de compra
    console.log('\nCalculando patrones de compra...');
    
    // Verificar si existe la tabla PatronesCompra
    const [patternTableExists] = await connection.query(`
      SELECT COUNT(*) as exists_table
      FROM information_schema.tables
      WHERE table_schema = 'tienda_bd' AND table_name = 'PatronesCompra'
    `);
    
    const patternTableExistsFlag = patternTableExists[0].exists_table > 0;
    
    if (!patternTableExistsFlag) {
      console.log('❌ La tabla PatronesCompra no existe. Se necesita ejecutar patrones-compra.sql primero.');
    } else {
      // Verificar si existe el procedimiento
      const [procResult] = await connection.query(`
        SELECT COUNT(*) as exists_proc
        FROM information_schema.routines
        WHERE routine_schema = 'tienda_bd' AND routine_name = 'CalcularPatronesCompra'
      `);
      
      if (procResult[0].exists_proc > 0) {
        console.log('Ejecutando procedimiento CalcularPatronesCompra...');
        await connection.query('CALL CalcularPatronesCompra()');
        console.log('✅ Patrones de compra calculados exitosamente');
        
        // Verificar resultados
        const [patrones] = await connection.query('SELECT COUNT(*) as count FROM PatronesCompra');
        console.log(`Se calcularon ${patrones[0].count} patrones de compra`);
      } else {
        console.log('❌ El procedimiento CalcularPatronesCompra no existe');
        console.log('Por favor, ejecuta primero el script patrones-compra.sql');
      }
    }
    
    console.log('\n✅ Configuración completada');
    
  } catch (error) {
    console.error('❌ Error durante la configuración:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Conexión cerrada');
    }
  }
}

// Ejecutar el script
ejecutarSetupDimensional().catch(console.error);
