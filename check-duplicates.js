const mysql = require('mysql2/promise');

async function checkDuplicateProducts() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '156321',
    database: 'tienda_bd'
  });
  
  try {
    // Verificar duplicados por nombre
    console.log('Verificando duplicados por nombre en DimensionProductos...');
    const [duplicates] = await connection.query(`
      SELECT nombre, COUNT(*) as conteo, MIN(producto_id) as min_id, MAX(producto_id) as max_id
      FROM DimensionProductos
      GROUP BY nombre
      HAVING COUNT(*) > 1
      ORDER BY conteo DESC
      LIMIT 10
    `);
    
    if (duplicates.length > 0) {
      console.log('Encontrados productos con nombres duplicados:');
      duplicates.forEach(d => {
        console.log(`  - '${d.nombre}': ${d.conteo} duplicados (IDs desde ${d.min_id} hasta ${d.max_id})`);
      });
      
      // Examinar un ejemplo de duplicado
      if (duplicates.length > 0) {
        const sampleName = duplicates[0].nombre;
        console.log(`\nDetalle del producto duplicado '${sampleName}':`);
        
        const [details] = await connection.query(`
          SELECT producto_id, nombre, precio_actual, stock_actual, punto_reorden, categoria
          FROM DimensionProductos
          WHERE nombre = ?
          ORDER BY producto_id
          LIMIT 5
        `, [sampleName]);
        
        details.forEach(p => {
          console.log(`  ID ${p.producto_id}: Precio: $${p.precio_actual}, Stock: ${p.stock_actual}, Categoría: ${p.categoria}`);
        });
      }
    } else {
      console.log('No se encontraron duplicados por nombre.');
    }
    
    // Verificar relación entre tablas
    console.log('\nVerificando mapeo entre Productos y DimensionProductos...');
    const [mapping] = await connection.query(`
      SELECT p.id as producto_original_id, p.nombre as nombre_original, 
             dp.producto_id as dim_id, dp.nombre as dim_nombre,
             p.precio_actual as precio_original, dp.precio_actual as dim_precio
      FROM Productos p
      JOIN DimensionProductos dp ON p.id = dp.producto_id
      LIMIT 5
    `);
    
    if (mapping.length > 0) {
      console.log('Ejemplos de mapeo:');
      mapping.forEach(m => {
        console.log(`  Producto #${m.producto_original_id} '${m.nombre_original}' -> DimensionProductos #${m.dim_id} '${m.dim_nombre}'`);
        console.log(`    Precio original: $${m.precio_original}, Precio dimensional: $${m.dim_precio}`);
      });
    } else {
      console.log('No se encontró mapeo directo entre IDs.');
      
      // Verificar si hay correlación entre las tablas
      console.log('\nVerificando posible correlación por nombre...');
      const [correlation] = await connection.query(`
        SELECT p.id as producto_original_id, p.nombre as nombre_original, 
               dp.producto_id as dim_id, dp.nombre as dim_nombre
        FROM Productos p, DimensionProductos dp 
        WHERE p.nombre = dp.nombre
        LIMIT 5
      `);
      
      if (correlation.length > 0) {
        console.log('Ejemplos de correlación por nombre:');
        correlation.forEach(c => {
          console.log(`  Producto #${c.producto_original_id} '${c.nombre_original}' correlaciona con DimensionProductos #${c.dim_id} '${c.dim_nombre}'`);
        });
      } else {
        console.log('No se encontró correlación por nombre.');
      }
    }
    
    // Verificar las estructuras de ambas tablas
    console.log('\nEstructura de la tabla Productos:');
    const [productosEstructura] = await connection.query('DESCRIBE Productos');
    productosEstructura.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key === 'PRI' ? 'PRIMARY KEY' : ''}`);
    });
    
    console.log('\nEstructura de la tabla DimensionProductos:');
    const [dimProductosEstructura] = await connection.query('DESCRIBE DimensionProductos');
    dimProductosEstructura.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key === 'PRI' ? 'PRIMARY KEY' : ''}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
    console.log('\nAnálisis completado.');
  }
}

checkDuplicateProducts();