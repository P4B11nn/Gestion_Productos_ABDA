USE tienda_bd;

-- Prueba de consulta simplificada
WITH Antecedentes AS (
    SELECT transaccion_id, JSON_ARRAYAGG(producto_id) AS ante_array
    FROM HechosVentas
    GROUP BY transaccion_id
    HAVING COUNT(*) > 1
)
SELECT 
    a.ante_array AS antecedente,
    b.producto_id AS consecuente,
    COUNT(DISTINCT a.transaccion_id) as transacciones_con_antecedente,
    COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) as transacciones_con_ambos,
    (COUNT(DISTINCT CASE WHEN b.transaccion_id IS NOT NULL THEN a.transaccion_id END) / 
     COUNT(DISTINCT a.transaccion_id)) AS confianza,
    COUNT(DISTINCT b.transaccion_id) as transacciones_con_consecuente,
    (SELECT COUNT(DISTINCT transaccion_id) FROM HechosVentas) as total_transacciones
FROM Antecedentes a
JOIN HechosVentas b ON a.transaccion_id = b.transaccion_id
GROUP BY a.ante_array, b.producto_id
LIMIT 10;