USE tienda_bd;

-- Procedimiento simplificado para agregar patrones nuevos
DROP PROCEDURE IF EXISTS AgregarPatronesSimple;

DELIMITER //
CREATE PROCEDURE AgregarPatronesSimple()
BEGIN
    DECLARE total_trans INT DEFAULT 0;
    
    -- Obtener el total de transacciones
    SELECT COUNT(DISTINCT id) INTO total_trans FROM Transacciones;
    
    -- Insertar directamente los mejores patrones nuevos
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
        CAST(COUNT(DISTINCT a.transaccion_id) AS DECIMAL(10,6)) / total_trans as soporte,
        CAST(COUNT(DISTINCT a.transaccion_id) AS DECIMAL(10,6)) / 
        CAST((SELECT COUNT(DISTINCT transaccion_id) FROM DetalleTransaccion WHERE producto_id = a.producto_id) AS DECIMAL(10,6)) as confianza,
        (CAST(COUNT(DISTINCT a.transaccion_id) AS DECIMAL(10,6)) / 
         CAST((SELECT COUNT(DISTINCT transaccion_id) FROM DetalleTransaccion WHERE producto_id = a.producto_id) AS DECIMAL(10,6))) /
        (CAST((SELECT COUNT(DISTINCT transaccion_id) FROM DetalleTransaccion WHERE producto_id = b.producto_id) AS DECIMAL(10,6)) / total_trans) as lift,
        COUNT(DISTINCT a.transaccion_id) as transacciones_juntos,
        (SELECT COUNT(DISTINCT transaccion_id) FROM DetalleTransaccion WHERE producto_id = a.producto_id) as transacciones_a,
        total_trans as total_transacciones
    FROM DetalleTransaccion a
    JOIN DetalleTransaccion b ON a.transaccion_id = b.transaccion_id AND a.producto_id < b.producto_id
    JOIN Productos pa ON a.producto_id = pa.id
    JOIN Productos pb ON b.producto_id = pb.id
    WHERE (a.producto_id > 30000 OR b.producto_id > 30000)
    GROUP BY a.producto_id, b.producto_id, pa.nombre, pb.nombre
    HAVING COUNT(DISTINCT a.transaccion_id) >= 2
       AND soporte >= 0.00001
       AND confianza >= 0.05
       AND lift > 1.0
    ORDER BY lift DESC
    LIMIT 50;
    
    -- Mostrar resultado
    SELECT ROW_COUNT() as 'Patrones agregados';
        
END //
DELIMITER ;

-- Ejecutar el procedimiento
CALL AgregarPatronesSimple();

-- Verificar resultados
SELECT COUNT(*) as 'Total patrones ahora' FROM PatronesCompra;

SELECT COUNT(*) as 'Patrones con productos nuevos' 
FROM PatronesCompra 
WHERE producto_a > 30000 OR producto_b > 30000;