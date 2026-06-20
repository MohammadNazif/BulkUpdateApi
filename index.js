const express = require('express');
const cors = require('cors');
const { sql, poolPromise } = require('./db');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
// Set a large limit for bulk JSON payloads
app.use(express.json({ limit: '50mb' }));

app.post('/api/voters/bulk-update', async (req, res) => {
  try {
    const data = req.body;

    // Basic validation
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty array of voter objects.' });
    }

    const pool = await poolPromise;

    // Convert array to JSON string for OPENJSON parsing in SQL Server
    const jsonData = JSON.stringify(data);
    // Using OPENJSON to perform a highly efficient bulk update
    // We update 't' from 'j' by matching on 'id'
    // ISNULL is used so that if a property is not provided in the payload, 
    // it won't overwrite the existing DB value with NULL.
    const query = `
      UPDATE t
      SET 
        t.voterNo = ISNULL(j.voterNo, t.voterNo),
        t.epic = ISNULL(j.epic, t.epic),
        t.name = ISNULL(j.name, t.name),
        t.fatherName = CASE WHEN j.relationType IS NOT NULL THEN (CASE WHEN UPPER(j.relationType) = 'FATHER' THEN j.relationName ELSE NULL END) ELSE ISNULL(j.fatherName, t.fatherName) END,
        t.husbandName = CASE WHEN j.relationType IS NOT NULL THEN (CASE WHEN UPPER(j.relationType) = 'HUSBAND' THEN j.relationName ELSE NULL END) ELSE ISNULL(j.husbandName, t.husbandName) END,
        t.motherName = CASE WHEN j.relationType IS NOT NULL THEN (CASE WHEN UPPER(j.relationType) = 'MOTHER' THEN j.relationName ELSE NULL END) ELSE ISNULL(j.motherName, t.motherName) END,
        t.othersParents = CASE WHEN j.relationType IS NOT NULL THEN (CASE WHEN UPPER(j.relationType) NOT IN ('FATHER', 'HUSBAND', 'MOTHER') THEN j.relationName ELSE NULL END) ELSE ISNULL(j.othersParents, t.othersParents) END,
        t.houseNo = ISNULL(j.houseNo, t.houseNo),
        t.age = ISNULL(j.age, t.age),
        t.gender = ISNULL(j.gender, t.gender),
        t.confidence = ISNULL(CAST(ROUND(j.ocrConfidence * 100, 0) AS INT), ISNULL(j.confidence, t.confidence)),
        t.NeedReview = ISNULL(j.needsEvaluation, ISNULL(j.NeedReview, t.NeedReview))
      FROM [tbl_TotalVoters] t
      INNER JOIN OPENJSON(@jsonData)
      WITH (
          id NVARCHAR(255) '$.id',
          voterNo NVARCHAR(100) '$.voterNo',
          epic NVARCHAR(100) '$.epic',
          name NVARCHAR(255) '$.name',
          fatherName NVARCHAR(255) '$.fatherName',
          husbandName NVARCHAR(255) '$.husbandName',
          motherName NVARCHAR(255) '$.motherName',
          othersParents NVARCHAR(255) '$.othersParents',
          houseNo NVARCHAR(100) '$.houseNo',
          age INT '$.age',
          ocrConfidence FLOAT '$.ocrConfidence',
          confidence INT '$.confidence',
          needsEvaluation BIT '$.needsEvaluation',
          NeedReview BIT '$.NeedReview',
          gender NVARCHAR(50) '$.gender',
          relationType NVARCHAR(50) '$.relationType',
          relationName NVARCHAR(255) '$.relationName'
      ) j ON t.id = j.id
    `;

    const request = pool.request();
    request.input('jsonData', sql.NVarChar(sql.MAX), jsonData);

    const result = await request.query(query);

    res.json({
      message: 'Bulk update successful',
      rowsAffected: result.rowsAffected[0]
    });

  } catch (err) {
    console.error('Error during bulk update:', err);
    res.status(500).json({ error: 'Internal server error during bulk update', details: err.message });
  }
});

// Basic health check route
app.get('/health', (req, res) => {
  res.send('API is running properly.');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
