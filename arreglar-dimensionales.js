/**
 * Script para arreglar las tablas dimensionales 
 */

const mysql = require('mysql2/promise');

// Configuración de la conexión
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd'
};

async function main() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Conexión a la base de datos establecida correctamente.');

    // 1. Arreglar dimensionclientes
    console.log('Arreglando tabla dimensionclientes...');

    // Verificar si existe la tabla
    const [clientesCheck] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tienda_bd' 
      AND LOWER(table_name) = 'dimensionclientes'
    `);

    if (clientesCheck.length > 0) {
      // Verificar las columnas
      const [columnsInfo] = await connection.query('SHOW COLUMNS FROM dimensionclientes');
      const columnas = columnsInfo.map(c => c.Field);
      console.log('Columnas en dimensionclientes:', columnas.join(', '));

      // Desactivar restricciones de clave externa
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');
      
      // Vaciar la tabla
      await connection.query('TRUNCATE TABLE dimensionclientes');
      
      // Insertar clientes desde la tabla transaccional
      // Primero verificamos todas las columnas necesarias
      try {
        // Consultar las columnas para generar una sentencia SQL dinámica
        const [clientesColumns] = await connection.query('SHOW COLUMNS FROM clientes');
        const camposClientes = clientesColumns.map(c => c.Field);
        
        // Verificar si la tabla dimensión tiene fecha_registro y si no tiene valor por defecto
        const tieneFechaRegistro = columnas.includes('fecha_registro');
        const sql = tieneFechaRegistro ? `
          INSERT INTO dimensionclientes (cliente_id, nombre, apellido, email, fecha_registro)
          SELECT id, nombre, apellido, email, NOW() FROM clientes
        ` : `
          INSERT INTO dimensionclientes (cliente_id, nombre, apellido, email)
          SELECT id, nombre, apellido, email FROM clientes
        `;
        
        await connection.query(sql);
      } catch (err) {
        console.error('Error al insertar en dimensionclientes:', err.message);
        
        // Plan B: inserción manual si falla la automática
        console.log('Intentando inserción manual...');
        
        const [clientes] = await connection.query('SELECT id, nombre, apellido, email FROM clientes');
        
        for (const cliente of clientes) {
          try {
            if (columnas.includes('fecha_registro')) {
              await connection.query(`
                INSERT INTO dimensionclientes 
                (cliente_id, nombre, apellido, email, fecha_registro) 
                VALUES (?, ?, ?, ?, NOW())
              `, [cliente.id, cliente.nombre, cliente.apellido, cliente.email]);
            } else {
              await connection.query(`
                INSERT INTO dimensionclientes 
                (cliente_id, nombre, apellido, email) 
                VALUES (?, ?, ?, ?)
              `, [cliente.id, cliente.nombre, cliente.apellido, cliente.email]);
            }
          } catch (insertError) {
            console.error(`Error al insertar cliente ${cliente.id}:`, insertError.message);
          }
        }
      }
      
      // Verificar la inserción
      const [countResult] = await connection.query('SELECT COUNT(*) as count FROM dimensionclientes');
      console.log(`Insertados ${countResult[0].count} registros en dimensionclientes`);
      
      // Reactivar restricciones
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } else {
      console.log('No se encontró la tabla dimensionclientes');
    }

    // 2. Verificar hechosventas
    console.log('\nArreglando tabla hechosventas...');

    const [hechosCheck] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tienda_bd' 
      AND LOWER(table_name) = 'hechosventas'
    `);

    if (hechosCheck.length > 0) {
      // Verificar registros
      const [countHechos] = await connection.query('SELECT COUNT(*) as count FROM hechosventas');
      console.log(`Actualmente hay ${countHechos[0].count} registros en hechosventas`);

      if (countHechos[0].count === 0) {
        // Desactivar restricciones
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        
        // Verificar columnas
        const [hechosColumns] = await connection.query('SHOW COLUMNS FROM hechosventas');
        const columnasHechos = hechosColumns.map(c => c.Field);
        console.log('Columnas en hechosventas:', columnasHechos.join(', '));
        
        // Determinar nombre de la columna para el subtotal
        const tieneSubtotal = columnasHechos.some(c => c.toLowerCase() === 'subtotal');
        const campoSubtotal = tieneSubtotal ? 'subtotal' : 'total';
        
        // Verificar si hay fechas y datos necesarios
        const [fechas] = await connection.query('SELECT COUNT(*) as count FROM dimensionfechas');
        const [productos] = await connection.query('SELECT COUNT(*) as count FROM dimensionproductos');
        const [clientes] = await connection.query('SELECT COUNT(*) as count FROM dimensionclientes');
        
        if (fechas[0].count > 0 && productos[0].count > 0 && clientes[0].count > 0) {
          console.log('Generando hechos de ventas desde datos transaccionales existentes...');
          
          // Generar hechos desde las transacciones existentes
          const sql = `
            INSERT INTO hechosventas 
            (transaccion_id, producto_id, cliente_id, fecha_id, cantidad_vendida, precio_unitario, ${campoSubtotal})
            SELECT 
              dt.transaccion_id,
              dt.producto_id,
              t.cliente_id,
              (SELECT fecha_id FROM dimensionfechas WHERE fecha = DATE(t.fecha_transaccion) LIMIT 1) as fecha_id,
              dt.cantidad,
              dt.precio_unitario_venta,
              dt.cantidad * dt.precio_unitario_venta AS ${campoSubtotal}
            FROM detalletransaccion dt
            JOIN transacciones t ON dt.transaccion_id = t.id
            WHERE EXISTS (
              SELECT 1 FROM dimensionfechas 
              WHERE fecha = DATE(t.fecha_transaccion)
            )
            LIMIT 10000
          `;
          
          await connection.query(sql);
          
          // Verificar resultado
          const [countAfter] = await connection.query('SELECT COUNT(*) as count FROM hechosventas');
          console.log(`Insertados ${countAfter[0].count} registros en hechosventas`);
        } else {
          console.log('No hay suficientes datos en las dimensiones para generar hechos');
        }
        
        // Reactivar restricciones
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      } else {
        console.log('La tabla hechosventas ya tiene datos, no es necesario arreglarla');
      }
    } else {
      console.log('No se encontró la tabla hechosventas');
    }

    console.log('\nEstado final de las tablas:');
    const tables = ['productos', 'clientes', 'transacciones', 'detalletransaccion', 
                    'dimensionproductos', 'dimensionclientes', 'dimensionfechas', 'hechosventas'];
    
    for (const table of tables) {
      try {
        const [count] = await connection.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`- ${table}: ${count[0].count} registros`);
      } catch (error) {
        console.log(`- ${table}: Error al contar registros`);
      }
    }
    
    console.log('\nProceso completado.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main().catch(console.error);