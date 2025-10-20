use tienda_bd;


-- Crear tabla Clientes primero (base para Transacciones)
CREATE TABLE Clientes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla Productos (base para DetalleTransaccion)
CREATE TABLE Productos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    stock_actual INT NOT NULL DEFAULT 0,
    precio_actual DECIMAL(10, 2) NOT NULL,
    fecha_caducidad DATE NULL,
    punto_reorden INT DEFAULT 20,
    estado VARCHAR(50) DEFAULT 'Activo'
);

-- Crear tabla Transacciones (depende de Clientes)
CREATE TABLE Transacciones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cliente_id INT NULL,
    fecha_transaccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_transaccion DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES Clientes(id)
);

-- Crear tabla DetalleTransaccion (depende de Transacciones y Productos)
CREATE TABLE DetalleTransaccion (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaccion_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario_venta DECIMAL(10, 2) NOT NULL, 
    FOREIGN KEY (transaccion_id) REFERENCES Transacciones(id),
    FOREIGN KEY (producto_id) REFERENCES Productos(id)
);

-- Crear tabla PaquetesPromocionales
CREATE TABLE PaquetesPromocionales (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_paquete VARCHAR(255) NOT NULL,
    precio_paquete DECIMAL(10, 2) NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- Crear tabla PaqueteProductos (depende de PaquetesPromocionales y Productos)
CREATE TABLE PaqueteProductos (
    paquete_id INT NOT NULL,
    producto_id INT NOT NULL,
    PRIMARY KEY (paquete_id, producto_id),
    FOREIGN KEY (paquete_id) REFERENCES PaquetesPromocionales(id),
    FOREIGN KEY (producto_id) REFERENCES Productos(id)
);
