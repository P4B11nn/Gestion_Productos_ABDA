USE tienda_bd;

-- Procedimiento ajustado para calcular patrones con criterios más realistas
DROP PROCEDURE IF EXISTS CalcularPatronesNuevosAjustado;

DELIMITER //
CREATE PROCEDURE CalcularPatronesNuevosAjustado()
BEGIN
    DECLARE total_trans INT DEFAULT 0;
    
    -- Obtener el total de transacciones
    SELECT COUNT(DISTINCT id) INTO total_trans FROM Transacciones;
    
    -- Insertar NUEVOS patrones de compra con criterios más flexibles
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
    HAVING COUNT(DISTINCT a.transaccion_id) >= 2  -- REDUCIDO: Al menos 2 transacciones juntos
       AND soporte >= 0.0001                     -- REDUCIDO: Soporte mínimo del 0.01%
       AND confianza >= 0.05                     -- REDUCIDO: Confianza mínima del 5%
       AND lift > 1.0                            -- Lift mayor a 1 (asociación positiva)
    ORDER BY lift DESC, confianza DESC
    LIMIT 100;  -- Limitar a los 100 mejores nuevos patrones
    
    -- Mostrar estadísticas
    SELECT 
        'Nuevos patrones agregados' as resultado,
        ROW_COUNT() as cantidad;
        
END //
DELIMITER ;

-- Ejecutar el procedimiento ajustado
CALL CalcularPatronesNuevosAjustado();

-- Verificar el total de patrones ahora
SELECT 
    'Total patrones después del ajuste' as metrica,
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
    'Patrones mixtos (nuevo + antiguo)',
    COUNT(*)
FROM PatronesCompra 
WHERE (producto_a > 30000 AND producto_b <= 30000) OR (producto_a <= 30000 AND producto_b > 30000)
UNION ALL
SELECT 
    'Patrones entre productos nuevos',
    COUNT(*)
FROM PatronesCompra 
WHERE producto_a > 30000 AND producto_b > 30000;

-- Mostrar los mejores nuevos patrones
SELECT 
    CONCAT(LEFT(nombre_producto_a, 30), ' → ', LEFT(nombre_producto_b, 30)) as patron_nuevo,
    ROUND(soporte * 100, 4) as 'Soporte (%)',
    ROUND(confianza * 100, 2) as 'Confianza (%)',
    ROUND(lift, 2) as 'Lift',
    transacciones_juntos as 'Apariciones',
    CASE 
        WHEN producto_a > 30000 AND producto_b > 30000 THEN 'Ambos nuevos'
        ELSE 'Mixto (nuevo+antiguo)'
    END as tipo_patron
FROM PatronesCompra 
WHERE producto_a > 30000 OR producto_b > 30000
ORDER BY lift DESC 
LIMIT 15;