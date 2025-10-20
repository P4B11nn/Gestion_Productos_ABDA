USE tiendabd;

-- Eliminar tabla y procedimiento existentes (si existen)
DROP TABLE IF EXISTS PatronesCompra;
DROP PROCEDURE IF EXISTS CalcularPatronesCompra;

-- Crear tabla para patrones de compra con antecedente como JSON
CREATE TABLE PatronesCompra (
    patron_id INT PRIMARY KEY AUTO_INCREMENT,
    antecedente JSON NOT NULL,  -- Array de producto_id (ej: [1, 2])
    consecuente VARCHAR(255) NOT NULL,  -- Producto_id único como consecuente
    soporte DECIMAL(5,4) NOT NULL,      -- Grado de credibilidad
    confianza DECIMAL(5,4) NOT NULL,    -- Grado de confianza
    lift DECIMAL(5,4) NOT NULL,         -- Valor de probabilidad
    fecha_calculo DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Procedimiento para calcular patrones de compra con JSON
DELIMITER //
CREATE PROCEDURE CalcularPatronesCompra()
BEGIN
    -- Limpiar tabla
    -- TRUNCATE TABLE PatronesCompra;

    -- Calcular para pares de productos (antecedente = múltiples productos, consecuente = un producto)
    INSERT INTO PatronesCompra (antecedente, consecuente, soporte, confianza, lift)
    WITH Antecedentes AS (
        SELECT transaccion_id, JSON_ARRAYAGG(producto_id) AS ante_array
        FROM HechosVentas
        GROUP BY transaccion_id
        HAVING COUNT(*) > 1  -- Solo transacciones con más de un producto
    )
    SELECT 
        a.ante_array AS antecedente,
        b.producto_id AS consecuente,
        COALESCE((COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / NULLIF(COUNT(DISTINCT a.transaccion_id), 0)), 0) AS soporte,
        COALESCE((COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / NULLIF(COUNT(DISTINCT a.transaccion_id), 0)), 0) AS confianza,
        COALESCE(((COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / NULLIF(COUNT(DISTINCT a.transaccion_id), 0)) / 
                  (COUNT(DISTINCT b.transaccion_id) / NULLIF(COUNT(DISTINCT a.transaccion_id), 0))), 1.0) AS lift
    FROM Antecedentes a
    LEFT JOIN HechosVentas b ON a.transaccion_id = b.transaccion_id
    GROUP BY a.ante_array, b.producto_id
    HAVING soporte > 0.01 AND confianza > 0.5 AND lift > 1;  -- Filtrar patrones significativos
END //
DELIMITER ;

-- Ejecutar el procedimiento
CALL CalcularPatronesCompra();

-- Ver resultados
SELECT * FROM PatronesCompra ORDER BY patron_id DESC LIMIT 10;

-- Descripción de la tabla
DESCRIBE PatronesCompra;
