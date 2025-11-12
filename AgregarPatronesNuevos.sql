USE tienda_bd;

-- Procedimiento mejorado para calcular patrones de compra SIN eliminar los existentes
DROP PROCEDURE IF EXISTS CalcularPatronesCompraNuevos;

DELIMITER //
CREATE PROCEDURE CalcularPatronesCompraNuevos()
BEGIN
    DECLARE total_trans INT DEFAULT 0;
    
    -- Obtener el total de transacciones
    SELECT COUNT(DISTINCT id) INTO total_trans FROM Transacciones;
    
    -- NO truncar la tabla, mantener patrones existentes
    -- TRUNCATE TABLE PatronesCompra; -- COMENTADO PARA MANTENER EXISTENTES
    
    -- Insertar NUEVOS patrones de compra incluyendo productos nuevos (>30000)
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
    WHERE 
        -- Solo calcular patrones que incluyan al menos un producto nuevo (>30000)
        (a.producto_id > 30000 OR b.producto_id > 30000)
        -- Y que no existan ya en la tabla
        AND NOT EXISTS (
            SELECT 1 FROM PatronesCompra pc 
            WHERE (pc.producto_a = a.producto_id AND pc.producto_b = b.producto_id)
               OR (pc.producto_a = b.producto_id AND pc.producto_b = a.producto_id)
        )
    GROUP BY a.producto_id, b.producto_id, pa.nombre, pb.nombre
    HAVING COUNT(DISTINCT a.transaccion_id) >= 3  -- Al menos 3 transacciones juntos
       AND soporte >= 0.001                       -- Soporte mínimo del 0.1%
       AND confianza >= 0.1                       -- Confianza mínima del 10%
       AND lift > 1.0                             -- Lift mayor a 1 (asociación positiva)
    ORDER BY lift DESC, confianza DESC;
    
    -- Mostrar estadísticas
    SELECT 
        'Patrones agregados en esta ejecución' as resultado,
        ROW_COUNT() as cantidad;
        
END //
DELIMITER ;

-- Ejecutar el procedimiento que agrega nuevos patrones
CALL CalcularPatronesCompraNuevos();

-- Mostrar estadísticas finales
SELECT 
    'Total patrones en la tabla' as metrica,
    COUNT(*) as valor
FROM PatronesCompra
UNION ALL
SELECT 
    'Patrones con productos nuevos (>30000)',
    COUNT(*)
FROM PatronesCompra 
WHERE producto_a > 30000 OR producto_b > 30000
UNION ALL
SELECT 
    'Patrones solo con productos antiguos',
    COUNT(*)
FROM PatronesCompra 
WHERE producto_a <= 30000 AND producto_b <= 30000
UNION ALL
SELECT 
    'Promedio de lift general',
    ROUND(AVG(lift), 2)
FROM PatronesCompra;

-- Mostrar algunos de los nuevos patrones con productos >30000
SELECT 
    CONCAT(nombre_producto_a, ' → ', nombre_producto_b) as patron_nuevo,
    ROUND(soporte * 100, 4) as 'Soporte (%)',
    ROUND(confianza * 100, 2) as 'Confianza (%)',
    ROUND(lift, 2) as 'Lift',
    transacciones_juntos as 'Trans. Juntos',
    CASE 
        WHEN lift >= 3 THEN 'Muy fuerte'
        WHEN lift >= 2 THEN 'Fuerte'
        WHEN lift >= 1.5 THEN 'Moderada'
        WHEN lift > 1 THEN 'Débil'
        ELSE 'Sin asociación'
    END as fuerza
FROM PatronesCompra 
WHERE producto_a > 30000 OR producto_b > 30000
ORDER BY lift DESC 
LIMIT 10;