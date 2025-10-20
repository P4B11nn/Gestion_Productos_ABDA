const mysql = require('mysql2/promise');

async function checkDatabaseTables() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '156321',
    database: 'tienda_bd'
  });
  
  try {
    console.log('Verificando tablas en la base de datos...');
    
    const [tables] = await connection.query(`
      SHOW TABLES
    `);
    
    console.log('\nTablas encontradas en tienda_bd:');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log(tableNames.join(', '));
    
    // Verificar si las tablas transaccionales están presentes (con el case exacto)
    const requiredTables = ['Productos', 'Transacciones', 'DetalleTransaccion'];
    const optionalTables = ['Clientes', 'PatronesCompra'];
    
    console.log('\nVerificación de tablas transaccionales (case-sensitive):');
    requiredTables.forEach(tableName => {
      console.log(`  - ${tableName}: ${tableNames.includes(tableName) ? 'Presente' : 'No encontrada'}`);
    });
    
    console.log('\nVerificación de tablas transaccionales (case-insensitive):');
    requiredTables.forEach(tableName => {
      const lowerCaseTableName = tableName.toLowerCase();
      const found = tableNames.some(t => t.toLowerCase() === lowerCaseTableName);
      console.log(`  - ${tableName}: ${found ? 'Presente como ' + tableNames.find(t => t.toLowerCase() === lowerCaseTableName) : 'No encontrada'}`);
    });
    
    // Comprobar si las tablas dimensionales están presentes
    const dimensionalTables = ['DimensionProductos', 'HechosVentas', 'DimensionFechas'];
    
    console.log('\nVerificación de tablas dimensionales:');
    for(const tableName of dimensionalTables) {
      console.log(`  - ${tableName}: ${tableNames.includes(tableName) ? 'Presente' : 'No encontrada'}`);
      if (tableNames.includes(tableName)) {
        // Contar registros
        const [count] = await connection.query(`SELECT COUNT(*) as total FROM ${tableName}`);
        console.log(`      Registros: ${count[0].total}`);
      }
    }
    
    // Verificar una tabla específica para entender el problema de case
    if (tableNames.some(t => t.toLowerCase() === 'productos')) {
      const exactTableName = tableNames.find(t => t.toLowerCase() === 'productos');
      console.log(`\nTabla 'productos' encontrada como '${exactTableName}'`);
      
      // Verificar estructura
      const [columns] = await connection.query(`DESCRIBE ${exactTableName}`);
      console.log(`\nEstructura de ${exactTableName}:`);
      columns.forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''}`);
      });
      
      // Contar registros
      const [count] = await connection.query(`SELECT COUNT(*) as total FROM ${exactTableName}`);
      console.log(`\nTotal registros en ${exactTableName}: ${count[0].total}`);
      
      // Ver primeros registros
      const [rows] = await connection.query(`SELECT * FROM ${exactTableName} LIMIT 3`);
      console.log(`\nPrimeros registros en ${exactTableName}:`);
      rows.forEach((row, i) => {
        console.log(`  Registro #${i+1}: id=${row.id}, nombre=${row.nombre}, precio=${row.precio_actual}`);
      });
    }
    
  } catch (error) {
    console.error('Error al verificar tablas:', error);
  } finally {
    await connection.end();
    console.log('\nAnálisis completado.');
  }
}

checkDatabaseTables();