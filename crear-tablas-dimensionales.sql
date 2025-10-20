-- Script para crear las tablas dimensionales necesarias

USE tienda_bd;

-- Crear tabla DimensionProductos si no existe
DROP TABLE IF EXISTS DimensionProductos;
CREATE TABLE DimensionProductos (
  producto_id INT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  categoria VARCHAR(100),
  precio_actual DECIMAL(10,2) NOT NULL,
  stock_actual INT NOT NULL DEFAULT 0,
  punto_reorden INT
);

-- Cargar datos desde la tabla Productos original
INSERT INTO DimensionProductos (producto_id, nombre, categoria, precio_actual, stock_actual, punto_reorden)
SELECT 
  id, 
  nombre, 
  estado AS categoria,
  precio_actual, 
  stock_actual,
  punto_reorden
FROM Productos;

-- Crear tabla DimensionClientes si no existe
DROP TABLE IF EXISTS DimensionClientes;
CREATE TABLE DimensionClientes (
  cliente_id INT PRIMARY KEY,
  nombre VARCHAR(100),
  apellido VARCHAR(100),
  email VARCHAR(255)
);

-- Cargar datos desde la tabla Clientes original
INSERT INTO DimensionClientes (cliente_id, nombre, apellido, email)
SELECT id, nombre, apellido, email FROM Clientes;

-- Crear tabla DimensionFechas si no existe
DROP TABLE IF EXISTS DimensionFechas;
CREATE TABLE DimensionFechas (
  fecha_id INT PRIMARY KEY AUTO_INCREMENT,
  fecha DATE NOT NULL,
  dia INT NOT NULL,
  mes INT NOT NULL,
  anio INT NOT NULL,
  trimestre INT NOT NULL,
  dia_semana INT NOT NULL,
  UNIQUE KEY (fecha)
);

-- Insertar fechas desde las transacciones existentes
INSERT IGNORE INTO DimensionFechas (fecha, dia, mes, anio, trimestre, dia_semana)
SELECT 
  DISTINCT DATE(fecha_transaccion) as fecha,
  DAY(fecha_transaccion) as dia,
  MONTH(fecha_transaccion) as mes,
  YEAR(fecha_transaccion) as anio,
  QUARTER(fecha_transaccion) as trimestre,
  DAYOFWEEK(fecha_transaccion) as dia_semana
FROM Transacciones;

-- Crear tabla HechosVentas si no existe
DROP TABLE IF EXISTS HechosVentas;
CREATE TABLE HechosVentas (
  hecho_id INT PRIMARY KEY AUTO_INCREMENT,
  transaccion_id INT NOT NULL,
  producto_id INT NOT NULL,
  cliente_id INT,
  fecha_id INT NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  KEY idx_producto (producto_id),
  KEY idx_cliente (cliente_id),
  KEY idx_fecha (fecha_id),
  KEY idx_transaccion (transaccion_id)
);

-- Cargar datos desde las tablas operativas
INSERT INTO HechosVentas (transaccion_id, producto_id, cliente_id, fecha_id, cantidad, precio_unitario, total)
SELECT 
  dt.transaccion_id,
  dt.producto_id,
  t.cliente_id,
  df.fecha_id,
  dt.cantidad,
  dt.precio_unitario_venta,
  dt.cantidad * dt.precio_unitario_venta AS total
FROM DetalleTransaccion dt
JOIN Transacciones t ON dt.transaccion_id = t.id
JOIN DimensionFechas df ON DATE(t.fecha_transaccion) = df.fecha;
  KEY idx_producto (producto_id),
  KEY idx_cliente (cliente_id),
  KEY idx_fecha (fecha_id),
  KEY idx_transaccion (transaccion_id)
);

-- Cargar datos desde las tablas operativas (Transacciones y DetalleTransaccion)
INSERT INTO HechosVentas (transaccion_id, producto_id, cliente_id, fecha_id, cantidad, precio_unitario, total)
SELECT 
  dt.transaccion_id,
  dt.producto_id,
  t.cliente_id,
  (SELECT fecha_id FROM DimensionFechas WHERE fecha = DATE(t.fecha_transaccion) LIMIT 1) AS fecha_id,
  dt.cantidad,
  dt.precio_unitario_venta,
  dt.cantidad * dt.precio_unitario_venta AS total
FROM DetalleTransaccion dt
JOIN Transacciones t ON dt.transaccion_id = t.id
WHERE EXISTS (SELECT 1 FROM DimensionFechas WHERE fecha = DATE(t.fecha_transaccion))
LIMIT 10000; -- Limitar para evitar sobrecarga inicial
