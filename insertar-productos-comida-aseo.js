/**
 * Script para insertar 20,000 productos adicionales de comida y aseo
 * Sin reiniciar la base de datos - solo añadir productos nuevos
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Configuración de la conexión
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '156321',
  database: 'tienda_bd',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Categorías específicas para comida y aseo
const categorias = [
  // Categorías de comida
  'Lácteos', 'Panadería', 'Carnes', 'Pescados', 'Frutas', 
  'Verduras', 'Congelados', 'Bebidas', 'Dulces', 'Conservas',
  'Cereales', 'Snacks', 'Condimentos', 'Aceites', 'Café y Té',
  // Categorías de aseo
  'Limpieza Hogar', 'Cuidado Personal', 'Papel', 'Detergentes', 'Desinfectantes'
];

// Adjetivos para generar nombres de productos
const adjetivos = [
  'Fresco', 'Natural', 'Orgánico', 'Tradicional', 'Gourmet',
  'Premium', 'Artesanal', 'Light', 'Zero', 'Diet',
  'Ecológico', 'Saludable', 'Integral', 'Sin Azúcar', 'Sin Gluten',
  'Concentrado', 'Extra', 'Nutritivo', 'Clásico', 'Especial',
  // Para productos de aseo
  'Ultra', 'Antibacterial', 'Hipoalergénico', 'Biodegradable', 'Multiuso'
];

// Nombres de productos de comida
const nombresProductosComida = [
  // Lácteos
  'Leche', 'Yogurt', 'Queso', 'Mantequilla', 'Crema',
  // Panadería
  'Pan', 'Croissant', 'Galletas', 'Pastel', 'Donas',
  // Carnes y embutidos
  'Jamón', 'Salchicha', 'Chorizo', 'Tocino', 'Pollo',
  // Pescados
  'Atún', 'Salmón', 'Camarones', 'Filetes', 'Sardinas',
  // Frutas
  'Manzana', 'Plátano', 'Naranja', 'Uvas', 'Fresas',
  // Verduras
  'Tomate', 'Lechuga', 'Zanahoria', 'Cebolla', 'Aguacate',
  // Congelados
  'Pizza', 'Helado', 'Hamburguesa', 'Lasagna', 'Nuggets',
  // Bebidas
  'Agua', 'Jugo', 'Refresco', 'Cerveza', 'Vino',
  // Dulces
  'Chocolate', 'Caramelos', 'Pastelitos', 'Gomitas', 'Chicles',
  // Conservas
  'Frijoles', 'Atún', 'Maíz', 'Chiles', 'Sopa',
  // Cereales
  'Avena', 'Cereal', 'Granola', 'Arroz', 'Pasta',
  // Snacks
  'Papas', 'Nachos', 'Palomitas', 'Nueces', 'Pretzels',
  // Condimentos
  'Sal', 'Pimienta', 'Ajo', 'Orégano', 'Chile',
  // Aceites y vinagres
  'Aceite', 'Vinagre', 'Mayonesa', 'Mostaza', 'Aderezo',
  // Café y té
  'Café', 'Té', 'Chocolate', 'Capuchino', 'Infusión'
];

// Nombres de productos de aseo
const nombresProductosAseo = [
  // Limpieza hogar
  'Limpiador', 'Desinfectante', 'Cloro', 'Suavizante', 'Quitamanchas',
  // Cuidado personal
  'Shampoo', 'Jabón', 'Crema', 'Desodorante', 'Pasta Dental',
  // Papel
  'Papel Higiénico', 'Servilletas', 'Toallas', 'Pañuelos', 'Pañales',
  // Detergentes
  'Detergente', 'Lavatrastes', 'Limpiador', 'Aromatizante', 'Desengrasante',
  // Artículos de limpieza
  'Escoba', 'Trapeador', 'Esponja', 'Cepillo', 'Trapo'
];

// Marcas para productos de comida
const marcasComida = [
  'NaturFood', 'FreshMart', 'DelValle', 'GranSabor', 'OrganiLife',     
  'FamilyFarm', 'GourmetSelect', 'NutriMax', 'TastyChoice', 'PuraDiet',
  'EcoHarvest', 'GoldenField', 'PremiumTaste', 'TraditionFood', 'NaturalHeritage',
  'OrganicFarms', 'HealthyBite', 'SimplePure', 'TasteMaster', 'WholeFoods'
];

// Marcas para productos de aseo
const marcasAseo = [
  'CleanMax', 'PureCare', 'FreshHome', 'TotalClean', 'BioCare',     
  'EcoClean', 'HomeBright', 'SafeGuard', 'SparkleShine', 'PureHygiene',
  'GreenCare', 'FreshScent', 'CleanPro', 'SoftTouch', 'BioFresh',
  'NaturalCare', 'CleanWave', 'PureSense', 'EasyClean', 'HomePure'
];

// Función para generar un precio aleatorio entre dos valores
function precioAleatorio(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// Función para generar un número entero aleatorio entre dos valores       
function enteroAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Función para generar un nombre de producto de comida aleatorio
function generarNombreProductoComida() {
  const marca = marcasComida[enteroAleatorio(0, marcasComida.length - 1)];
  const adjetivo = adjetivos[enteroAleatorio(0, adjetivos.length - 1)];
  const nombre = nombresProductosComida[enteroAleatorio(0, nombresProductosComida.length - 1)];
  const presentacion = ['Paquete', 'Caja', 'Lata', 'Botella', 'Bolsa', 'Frasco'][enteroAleatorio(0, 5)];
  const tamanio = [`${enteroAleatorio(100, 1000)}g`, `${enteroAleatorio(100, 3000)}ml`, `${enteroAleatorio(1, 5)}kg`, `${enteroAleatorio(1, 5)}L`][enteroAleatorio(0, 3)];

  // Combinamos de diferentes formas para generar variedad
  const opciones = [
    `${marca} ${nombre} ${adjetivo} ${tamanio}`,
    `${nombre} ${adjetivo} ${marca} ${tamanio}`,
    `${marca} ${nombre} ${presentacion} ${tamanio}`,
    `${adjetivo} ${nombre} ${marca} ${presentacion}`,
    `${nombre} ${marca} ${adjetivo} ${tamanio}`
  ];

  return opciones[enteroAleatorio(0, opciones.length - 1)];
}

// Función para generar un nombre de producto de aseo aleatorio
function generarNombreProductoAseo() {
  const marca = marcasAseo[enteroAleatorio(0, marcasAseo.length - 1)];
  const adjetivo = adjetivos[enteroAleatorio(0, adjetivos.length - 1)];
  const nombre = nombresProductosAseo[enteroAleatorio(0, nombresProductosAseo.length - 1)];
  const presentacion = ['Botella', 'Paquete', 'Frasco', 'Dispensador', 'Barra'][enteroAleatorio(0, 4)];
  const tamanio = [`${enteroAleatorio(100, 1000)}g`, `${enteroAleatorio(100, 3000)}ml`, `${enteroAleatorio(1, 5)}L`, `${enteroAleatorio(1, 24)} piezas`][enteroAleatorio(0, 3)];

  // Combinamos de diferentes formas para generar variedad
  const opciones = [
    `${marca} ${nombre} ${adjetivo} ${tamanio}`,
    `${nombre} ${adjetivo} ${marca} ${tamanio}`,
    `${marca} ${nombre} ${presentacion} ${tamanio}`,
    `${adjetivo} ${nombre} ${marca} ${presentacion}`,
    `${nombre} ${marca} ${adjetivo} ${tamanio}`
  ];

  return opciones[enteroAleatorio(0, opciones.length - 1)];
}

// Función para generar una fecha de caducidad aleatoria para productos alimenticios
function generarFechaCaducidad() {
  const hoy = new Date();
  // Caducidad entre 3 meses y 2 años a partir de hoy
  const diasAdicionales = enteroAleatorio(90, 730);
  hoy.setDate(hoy.getDate() + diasAdicionales);
  return hoy.toISOString().slice(0, 10);
}

// Función para insertar datos masivos en la base de datos
async function insertarProductosMasivos(pool, cantidadProductos) {
  // Registrar inicio
  console.time('Inserción de productos');

  try {
    console.log(`=== INSERTANDO ${cantidadProductos} PRODUCTOS DE COMIDA Y ASEO ===`);
    
    // Crear consulta para inserción masiva de productos
    let valoresProductos = [];
    let productosComida = Math.floor(cantidadProductos * 0.7); // 70% productos de comida
    let productosAseo = cantidadProductos - productosComida; // 30% productos de aseo
    
    console.log(`Distribución: ${productosComida} productos de comida, ${productosAseo} productos de aseo`);
    
    // 1. Insertar productos de comida
    console.log('Insertando productos de comida...');
    for (let i = 1; i <= productosComida; i++) {
      const nombre = generarNombreProductoComida();
      // Categorías de comida son los primeros 15 elementos del array categorias
      const categoria = categorias[enteroAleatorio(0, 14)]; 
      const precio = precioAleatorio(5, 250); // Precios entre $5 y $250
      const stock = enteroAleatorio(10, 300);
      const puntoReorden = enteroAleatorio(5, 50);
      // Fecha de caducidad para productos alimenticios
      const fechaCaducidad = generarFechaCaducidad();

      // Generamos una descripción para el producto
      const descripcion = `${nombre}. ${adjetivos[enteroAleatorio(0, adjetivos.length - 1)]} producto de ${categoria}. Ideal para toda la familia.`;

      // Incluimos fecha de caducidad para alimentos
      valoresProductos.push(`('${nombre}', '${descripcion}', ${stock}, ${precio}, '${fechaCaducidad}', ${puntoReorden}, '${categoria}')`);
      
      // Insertar en lotes de 500 para evitar consultas demasiado grandes
      if (i % 500 === 0 || i === productosComida) {
        await pool.query(`
          INSERT INTO Productos (nombre, descripcion, stock_actual, precio_actual, fecha_caducidad, punto_reorden, estado)
          VALUES ${valoresProductos.join(',')}
        `);
        valoresProductos = [];
        console.log(`  Progreso comida: ${i}/${productosComida} productos insertados`);
      }
    }

    // 2. Insertar productos de aseo
    console.log('Insertando productos de aseo...');
    for (let i = 1; i <= productosAseo; i++) {
      const nombre = generarNombreProductoAseo();
      // Categorías de aseo son los últimos 5 elementos del array categorias
      const categoria = categorias[enteroAleatorio(15, 19)]; 
      const precio = precioAleatorio(10, 300); // Precios entre $10 y $300
      const stock = enteroAleatorio(20, 400);
      const puntoReorden = enteroAleatorio(10, 70);
      // Productos de aseo no tienen caducidad (NULL)

      // Generamos una descripción para el producto
      const descripcion = `${nombre}. Producto de ${categoria} de alta calidad. Resultados garantizados.`;

      // NULL para fecha de caducidad en productos de aseo
      valoresProductos.push(`('${nombre}', '${descripcion}', ${stock}, ${precio}, NULL, ${puntoReorden}, '${categoria}')`);
      
      // Insertar en lotes de 500 para evitar consultas demasiado grandes
      if (i % 500 === 0 || i === productosAseo) {
        await pool.query(`
          INSERT INTO Productos (nombre, descripcion, stock_actual, precio_actual, fecha_caducidad, punto_reorden, estado)
          VALUES ${valoresProductos.join(',')}
        `);
        valoresProductos = [];
        console.log(`  Progreso aseo: ${i}/${productosAseo} productos insertados`);
      }
    }

    // 3. Actualizar tablas dimensionales si existen
    console.log('\nVerificando tablas dimensionales para actualizar...');
    
    const [tablesCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tienda_bd' 
      AND table_name = 'DimensionProductos'
    `);
    
    if (tablesCheck.length > 0) {
      console.log('Actualizando tabla dimensional de productos...');
      
      // Obtener el último ID de producto insertado en la tabla dimensional
      const [lastIdResult] = await pool.query(`
        SELECT MAX(producto_id) as max_id FROM DimensionProductos
      `);
      
      const lastId = lastIdResult[0].max_id || 0;
      console.log(`Último ID en DimensionProductos: ${lastId}`);
      
      // Insertar nuevos productos en la tabla dimensional
      await pool.query(`
        INSERT INTO DimensionProductos (producto_id, nombre, categoria, precio_actual, stock_actual, punto_reorden)
        SELECT id, nombre, estado, precio_actual, stock_actual, punto_reorden 
        FROM Productos 
        WHERE id > ${lastId}
      `);
      
      console.log('Tabla dimensional actualizada correctamente');
    } else {
      console.log('No se encontró la tabla dimensional de productos');
    }
    
  } catch (error) {
    console.error('Error al insertar productos:', error);
  }

  // Registrar tiempo total
  console.timeEnd('Inserción de productos');
}

// Función principal
async function main() {
  try {
    console.log('Iniciando inserción de nuevos productos de comida y aseo...');
    
    // Crear pool para conexiones múltiples durante la inserción masiva    
    const pool = mysql.createPool(dbConfig);

    // Verificar la conexión
    await pool.query('SELECT 1');
    console.log('Conexión a la base de datos establecida correctamente');

    // Obtener conteo actual de productos para referencia
    const [productosActuales] = await pool.query('SELECT COUNT(*) as total FROM Productos');
    console.log(`Productos actuales en la base de datos: ${productosActuales[0].total}`);

    // Insertar nuevos productos
    const cantidadProductos = 20000;
    await insertarProductosMasivos(pool, cantidadProductos);

    // Verificar conteo final
    const [productosFinales] = await pool.query('SELECT COUNT(*) as total FROM Productos');
    console.log(`\nProductos finales en la base de datos: ${productosFinales[0].total}`);
    console.log(`Productos nuevos insertados: ${productosFinales[0].total - productosActuales[0].total}`);

    // Verificar si existen hechos de ventas y actualizar si es necesario
    const [hechosCheck] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tienda_bd' 
      AND table_name = 'HechosVentas'
    `);
    
    if (hechosCheck.length > 0) {
      console.log('\nNota: Se ha detectado la tabla HechosVentas.');
      console.log('Para generar datos de ventas para los nuevos productos, ejecute:');
      console.log('CALL CalcularPatronesCompra()');
    }

    // Cerrar conexiones
    await pool.end();
    console.log('\nProceso completado exitosamente.');

  } catch (error) {
    console.error('Error general:', error);
  }
}

// Ejecutar función principal
main().catch(console.error);