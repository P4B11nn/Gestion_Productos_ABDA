const mysql = require('mysql2/promise');

async function checkTableStructure() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '156321',
    database: 'tienda_bd'
  });
  
  try {
    console.log('Verificando estructura de la tabla HechosVentas...');
    
    const [columns] = await connection.query('DESCRIBE HechosVentas');
    
    console.log('\nColumnas en HechosVentas:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key === 'PRI' ? 'PRIMARY KEY' : ''}`);
    });
    
    // Intentar obtener algunas filas para ver la estructura real
    const [rows] = await connection.query('SELECT * FROM HechosVentas LIMIT 2');
    
    console.log('\nEjemplo de datos en HechosVentas:');
    if (rows.length > 0) {
      const firstRow = rows[0];
      Object.keys(firstRow).forEach(key => {
        console.log(`  ${key}: ${firstRow[key]}`);
      });
    } else {
      console.log('  No hay datos en la tabla.');
    }
    
    // Verificar el script de creación de la tabla
    console.log('\nBuscando el script de creación de la tabla...');
    const [createScript] = await connection.query('SHOW CREATE TABLE HechosVentas');
    
    if (createScript.length > 0) {
      console.log('\nScript de creación:');
      console.log(createScript[0]['Create Table']);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
    console.log('\nVerificación completada.');
  }
}

checkTableStructure();