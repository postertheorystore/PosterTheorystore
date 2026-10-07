import pool from "../config/db.js";
// Track a page visit (public endpoint)
export const trackVisit = async (req, res) => {
    const { page } = req.body;
    if (!page || typeof page !== "string")
        return res.status(400).json({ error: "page required" });
    const ip = req.ip || req.socket.remoteAddress || "";
    const userAgent = (req.headers["user-agent"] || "").slice(0, 500);
    const referrer = (req.headers["referer"] || req.body.referrer || "").slice(0, 500);
    try {
        await pool.query("INSERT INTO page_visits (page, ip, user_agent, referrer) VALUES ($1, $2, $3, $4)", [page.slice(0, 200), ip.slice(0, 100), userAgent, referrer]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error("Track visit error:", err);
        res.status(500).json({ error: "Failed" });
    }
};
// Validate date string format (YYYY-MM-DD)
const isValidDate = (d) => {
    if (!d)
        return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
};
// Full analytics data for admin
export const getAnalytics = async (req, res) => {
    const startDate = isValidDate(req.query.start) ? req.query.start : undefined;
    const endDate = isValidDate(req.query.end) ? req.query.end : undefined;
    // Build parameterized date filter helpers
    const hasRange = startDate || endDate;
    // Params array will be built per-query with these values
    const startVal = startDate || '1970-01-01';
    const endVal = endDate || '9999-12-31';
    // Helper to build WHERE clause fragments with param placeholders
    // For orders (alias o)
    const buildOrderFilter = (paramOffset) => {
        if (!hasRange)
            return { clause: '', params: [] };
        return {
            clause: `AND o.created_at >= $${paramOffset}::date AND o.created_at <= $${paramOffset + 1}::date + INTERVAL '1 day'`,
            params: [startVal, endVal],
        };
    };
    const buildVisitFilter = (paramOffset) => {
        if (!hasRange)
            return { clause: '', params: [] };
        return {
            clause: `AND pv.created_at >= $${paramOffset}::date AND pv.created_at <= $${paramOffset + 1}::date + INTERVAL '1 day'`,
            params: [startVal, endVal],
        };
    };
    const buildUserFilter = (paramOffset) => {
        if (!hasRange)
            return { clause: '', params: [] };
        return {
            clause: `AND created_at >= $${paramOffset}::date AND created_at <= $${paramOffset + 1}::date + INTERVAL '1 day'`,
            params: [startVal, endVal],
        };
    };
    try {
        const of1 = buildOrderFilter(1);
        const vf1 = buildVisitFilter(1);
        const uf1 = buildUserFilter(1);
        const [totalRevenue, revenueByDay, revenueByMonth, totalOrders, ordersByStatus, totalVisits, visitsByPage, visitsToday, visitsByDay, uniqueVisitors, topProducts, salesByCollection, salesBySize, salesByLayout, totalCustomers, newCustomers,] = await Promise.all([
            pool.query(`SELECT COALESCE(SUM(total), 0) as total FROM orders o WHERE status != 'cancelled' ${of1.clause}`, of1.params),
            pool.query(hasRange
                ? `SELECT DATE(o.created_at) as date, SUM(total) as revenue, COUNT(*) as orders FROM orders o WHERE status != 'cancelled' ${of1.clause} GROUP BY DATE(o.created_at) ORDER BY date`
                : `SELECT DATE(o.created_at) as date, SUM(total) as revenue, COUNT(*) as orders FROM orders o WHERE status != 'cancelled' AND o.created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(o.created_at) ORDER BY date`, hasRange ? of1.params : []),
            pool.query(hasRange
                ? `SELECT TO_CHAR(o.created_at, 'YYYY-MM') as month, SUM(total) as revenue, COUNT(*) as orders FROM orders o WHERE status != 'cancelled' ${of1.clause} GROUP BY TO_CHAR(o.created_at, 'YYYY-MM') ORDER BY month`
                : `SELECT TO_CHAR(o.created_at, 'YYYY-MM') as month, SUM(total) as revenue, COUNT(*) as orders FROM orders o WHERE status != 'cancelled' AND o.created_at >= NOW() - INTERVAL '12 months' GROUP BY TO_CHAR(o.created_at, 'YYYY-MM') ORDER BY month`, hasRange ? of1.params : []),
            pool.query(`SELECT COUNT(*) FROM orders o WHERE 1=1 ${of1.clause}`, of1.params),
            pool.query(`SELECT status, COUNT(*) as count FROM orders o WHERE 1=1 ${of1.clause} GROUP BY status ORDER BY count DESC`, of1.params),
            pool.query(`SELECT COUNT(*) FROM page_visits pv WHERE 1=1 ${vf1.clause}`, vf1.params),
            pool.query(`SELECT page, COUNT(*) as views, COUNT(DISTINCT ip) as unique_views FROM page_visits pv WHERE 1=1 ${vf1.clause} GROUP BY page ORDER BY views DESC LIMIT 20`, vf1.params),
            pool.query("SELECT COUNT(*) FROM page_visits WHERE created_at >= CURRENT_DATE"),
            pool.query(hasRange
                ? `SELECT DATE(pv.created_at) as date, COUNT(*) as views, COUNT(DISTINCT ip) as unique_views FROM page_visits pv WHERE 1=1 ${vf1.clause} GROUP BY DATE(pv.created_at) ORDER BY date`
                : `SELECT DATE(pv.created_at) as date, COUNT(*) as views, COUNT(DISTINCT ip) as unique_views FROM page_visits pv WHERE 1=1 AND pv.created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(pv.created_at) ORDER BY date`, hasRange ? vf1.params : []),
            pool.query(hasRange
                ? `SELECT COUNT(DISTINCT ip) FROM page_visits pv WHERE 1=1 ${vf1.clause}`
                : `SELECT COUNT(DISTINCT ip) FROM page_visits pv WHERE 1=1 AND pv.created_at >= NOW() - INTERVAL '30 days'`, hasRange ? vf1.params : []),
            pool.query(`SELECT p.id, p.title, p.image, c.name as collection_name,
          SUM(COALESCE((item->>'quantity')::int, 1)) as units_sold,
          SUM((item->>'price')::int * COALESCE((item->>'quantity')::int, 1)) as revenue
        FROM orders o, jsonb_array_elements(o.items) as item
        JOIN products p ON p.id = COALESCE((item->>'productId')::bigint, (item->>'id')::bigint)
        LEFT JOIN collections c ON p.collection_id = c.id
        WHERE o.status != 'cancelled' ${of1.clause}
        GROUP BY p.id, p.title, p.image, c.name
        ORDER BY units_sold DESC LIMIT 15`, of1.params).catch(() => ({ rows: [] })),
            pool.query(`SELECT c.name as collection, SUM(COALESCE((item->>'quantity')::int, 1)) as units_sold,
          SUM((item->>'price')::int * COALESCE((item->>'quantity')::int, 1)) as revenue
        FROM orders o, jsonb_array_elements(o.items) as item
        JOIN products p ON p.id = COALESCE((item->>'productId')::bigint, (item->>'id')::bigint)
        JOIN collections c ON p.collection_id = c.id
        WHERE o.status != 'cancelled' ${of1.clause}
        GROUP BY c.name ORDER BY revenue DESC`, of1.params).catch(() => ({ rows: [] })),
            pool.query(`SELECT COALESCE(item->'customSpecs'->>'size', item->>'size') as size,
          SUM(COALESCE((item->>'quantity')::int, 1)) as units_sold,
          SUM((item->>'price')::int * COALESCE((item->>'quantity')::int, 1)) as revenue
        FROM orders o, jsonb_array_elements(o.items) as item
        WHERE o.status != 'cancelled' ${of1.clause}
        GROUP BY COALESCE(item->'customSpecs'->>'size', item->>'size') ORDER BY revenue DESC`, of1.params).catch(() => ({ rows: [] })),
            pool.query(`SELECT COALESCE(item->'customSpecs'->>'layout', item->>'layout') as layout,
          SUM(COALESCE((item->>'quantity')::int, 1)) as units_sold,
          SUM((item->>'price')::int * COALESCE((item->>'quantity')::int, 1)) as revenue
        FROM orders o, jsonb_array_elements(o.items) as item
        WHERE o.status != 'cancelled' ${of1.clause}
        GROUP BY COALESCE(item->'customSpecs'->>'layout', item->>'layout') ORDER BY revenue DESC`, of1.params).catch(() => ({ rows: [] })),
            pool.query(`SELECT COUNT(*) FROM users WHERE is_admin = false AND email_verified = true ${uf1.clause}`, uf1.params),
            pool.query(hasRange
                ? `SELECT COUNT(*) FROM users WHERE is_admin = false AND email_verified = true ${uf1.clause}`
                : `SELECT COUNT(*) FROM users WHERE is_admin = false AND email_verified = true AND created_at >= date_trunc('month', CURRENT_DATE)`, hasRange ? uf1.params : []),
        ]);
        const avgOrder = await pool.query(`SELECT COALESCE(AVG(total), 0) as avg FROM orders o WHERE status != 'cancelled' AND total > 0 ${of1.clause}`, of1.params);
        res.json({
            revenue: {
                total: parseInt(totalRevenue.rows[0].total),
                byDay: revenueByDay.rows,
                byMonth: revenueByMonth.rows,
                averageOrderValue: Math.round(parseFloat(avgOrder.rows[0].avg)),
            },
            orders: {
                total: parseInt(totalOrders.rows[0].count),
                byStatus: ordersByStatus.rows,
            },
            visits: {
                total: parseInt(totalVisits.rows[0].count),
                today: parseInt(visitsToday.rows[0].count),
                uniqueLast30Days: parseInt(uniqueVisitors.rows[0].count),
                byPage: visitsByPage.rows,
                byDay: visitsByDay.rows,
            },
            products: {
                topSelling: topProducts.rows,
                byCollection: salesByCollection.rows,
                bySize: salesBySize.rows,
                byLayout: salesByLayout.rows,
            },
            customers: {
                total: parseInt(totalCustomers.rows[0].count),
                newThisMonth: parseInt(newCustomers.rows[0].count),
            },
        });
    }
    catch (err) {
        console.error("Analytics error:", err);
        res.status(500).json({ error: "Failed to load analytics" });
    }
};
