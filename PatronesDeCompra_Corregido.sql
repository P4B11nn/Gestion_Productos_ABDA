USE tienda_bd;

-- Eliminar tabla y procedimiento existentes (si existen)
DROP TABLE IF EXISTS PatronesCompra;
DROP PROCEDURE IF EXISTS CalcularPatronesCompra;

-- Crear tabla para patrones de compra con campos corregidos
CREATE TABLE PatronesCompra (
    patron_id INT PRIMARY KEY AUTO_INCREMENT,
    producto_a INT NOT NULL,                -- Primer producto del patrón
    producto_b INT NOT NULL,                -- Segundo producto del patrón
    nombre_producto_a VARCHAR(255),         -- Nombre del primer producto
    nombre_producto_b VARCHAR(255),         -- Nombre del segundo producto
    soporte DECIMAL(10,6) NOT NULL,         -- Grado de credibilidad (ampliado)
    confianza DECIMAL(10,6) NOT NULL,       -- Grado de confianza (ampliado)
    lift DECIMAL(10,6) NOT NULL,            -- Valor de lift (ampliado)
    transacciones_juntos INT DEFAULT 0,     -- Número de transacciones donde aparecen juntos
    transacciones_a INT DEFAULT 0,          -- Número de transacciones con producto A
    total_transacciones INT DEFAULT 0,      -- Total de transacciones analizadas
    fecha_calculo DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_productos (producto_a, producto_b),
    INDEX idx_lift (lift DESC),
    INDEX idx_confianza (confianza DESC)
);

-- Procedimiento mejorado para calcular patrones de compra
DELIMITER //
CREATE PROCEDURE CalcularPatronesCompra()
BEGIN
    DECLARE total_trans INT DEFAULT 0;
    DECLARE done INT DEFAULT FALSE;
    
    -- Obtener el total de transacciones
    SELECT COUNT(DISTINCT id) INTO total_trans FROM Transacciones;
    
    -- Limpiar tabla anterior
    TRUNCATE TABLE PatronesCompra;
    
    -- Insertar patrones de compra usando DetalleTransaccion
    INSERT INTO PatronesCompra (
        producto_a, 
        producto_b, 
        nombre_producto_a, 
        nombre_producto_b,
        soporte, 
        confianza, 
        lift,
        transacciones_juntos,
        transacciones_a,
        total_transacciones
    )
    SELECT 
        a.producto_id as producto_a,
        b.producto_id as producto_b,
        pa.nombre as nombre_producto_a,
        pb.nombre as nombre_producto_b,
        -- Soporte: P(A ∩ B) = transacciones con ambos productos / total transacciones
        CAST(COUNT(DISTINCT a.transaccion_id) AS DECIMAL(10,6)) / total_trans as soporte,
        -- Confianza: P(B|A) = transacciones con ambos / transacciones con A
        CAST(COUNT(DISTINCT a.transaccion_id) AS DECIMAL(10,6)) / 
        NULLIF(CAST((SELECT COUNT(DISTINCT transaccion_id) 
                     FROM DetalleTransaccion 
                     WHERE producto_id = a.producto_id) AS DECIMAL(10,6)), 0) as confianza,
        -- Lift: P(B|A) / P(B)
        (CAST(COUNT(DISTINCT a.transaccion_id) AS DECIMAL(10,6)) / 
         NULLIF(CAST((SELECT COUNT(DISTINCT transaccion_id) 
                      FROM DetalleTransaccion 
                      WHERE producto_id = a.producto_id) AS DECIMAL(10,6)), 0)) /
        NULLIF(CAST((SELECT COUNT(DISTINCT transaccion_id) 
                     FROM DetalleTransaccion 
                     WHERE producto_id = b.producto_id) AS DECIMAL(10,6)) / total_trans, 0) as lift,
        COUNT(DISTINCT a.transaccion_id) as transacciones_juntos,
        (SELECT COUNT(DISTINCT transaccion_id) 
         FROM DetalleTransaccion 
         WHERE producto_id = a.producto_id) as transacciones_a,
        total_trans as total_transacciones
    FROM DetalleTransaccion a
    JOIN DetalleTransaccion b ON a.transaccion_id = b.transaccion_id 
                                AND a.producto_id < b.producto_id  -- Evitar duplicados y auto-referencias
    JOIN Productos pa ON a.producto_id = pa.id
    JOIN Productos pb ON b.producto_id = pb.id
    GROUP BY a.producto_id, b.producto_id, pa.nombre, pb.nombre
    HAVING COUNT(DISTINCT a.transaccion_id) >= 3  -- Al menos 3 transacciones juntos
       AND soporte >= 0.001                       -- Soporte mínimo del 0.1%
       AND confianza >= 0.1                       -- Confianza mínima del 10%
       AND lift > 1.0                             -- Lift mayor a 1 (asociación positiva)
    ORDER BY lift DESC, confianza DESC
    LIMIT 1000;  -- Limitar a los 1000 mejores patrones
    
END //
DELIMITER ;

-- Vista para facilitar consultas de patrones
CREATE OR REPLACE VIEW VistaPatronesCompra AS
SELECT 
    p.patron_id,
    p.producto_a,
    p.nombre_producto_a,
    p.producto_b,
    p.nombre_producto_b,
    CONCAT(p.nombre_producto_a, ' → ', p.nombre_producto_b) as patron,
    ROUND(p.soporte * 100, 2) as soporte_porcentaje,
    ROUND(p.confianza * 100, 2) as confianza_porcentaje,
    ROUND(p.lift, 2) as lift_valor,
    p.transacciones_juntos,
    p.transacciones_a,
    p.fecha_calculo,
    -- Interpretación del patrón
    CASE 
        WHEN p.lift >= 3 THEN 'Asociación muy fuerte'
        WHEN p.lift >= 2 THEN 'Asociación fuerte'
        WHEN p.lift >= 1.5 THEN 'Asociación moderada'
        WHEN p.lift > 1 THEN 'Asociación débil'
        ELSE 'Sin asociación'
    END as interpretacion
FROM PatronesCompra p
ORDER BY p.lift DESC, p.confianza DESC;

-- Ejecutar el cálculo
CALL CalcularPatronesCompra();

-- Mostrar estadísticas
SELECT 
    'Patrones calculados' as metrica,
    COUNT(*) as valor
FROM PatronesCompra
UNION ALL
SELECT 
    'Promedio de lift',
    ROUND(AVG(lift), 2)
FROM PatronesCompra
UNION ALL
SELECT 
    'Promedio de confianza (%)',
    ROUND(AVG(confianza) * 100, 2)
FROM PatronesCompra
UNION ALL
SELECT 
    'Patrones con lift > 2',
    COUNT(*)
FROM PatronesCompra 
WHERE lift > 2;

-- Mostrar los mejores 10 patrones
SELECT 
    patron,
    soporte_porcentaje as 'Soporte (%)',
    confianza_porcentaje as 'Confianza (%)',
    lift_valor as 'Lift',
    transacciones_juntos as 'Transacciones',
    interpretacion
FROM VistaPatronesCompra 
LIMIT 10;