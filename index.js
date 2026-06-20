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

    // Map incoming format to our database schema
    const transformedData = data.map(item => {
      const transformed = {
        id: item.id,
        voterNo: item.voterNo,
        epic: item.epic,
        name: item.name,
        houseNo: item.houseNo,
        age: item.age,
        gender: item.gender
      };

      // Handle relation mapping
      if (item.relationType && item.relationName) {
        const rType = item.relationType.toUpperCase();
        if (rType === 'HUSBAND') {
          transformed.husbandName = item.relationName;
        } else if (rType === 'FATHER') {
          transformed.fatherName = item.relationName;
        } else if (rType === 'MOTHER') {
          transformed.motherName = item.relationName;
        } else {
          transformed.othersParents = item.relationName;
        }
      }

      // Handle confidence (convert 0-1 float to 0-100 INT)
      if (typeof item.ocrConfidence === 'number') {
        transformed.confidence = Math.round(item.ocrConfidence * 100);
      }

      // Handle needsEvaluation (map to NeedReview)
      if (typeof item.needsEvaluation !== 'undefined') {
        transformed.NeedReview = item.needsEvaluation ? 1 : 0;
      }

      return transformed;
    });

    // Convert array to JSON string for OPENJSON parsing in SQL Server
    const jsonData = JSON.stringify(transformedData);

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
        t.fatherName = ISNULL(j.fatherName, t.fatherName),
        t.husbandName = ISNULL(j.husbandName, t.husbandName),
        t.motherName = ISNULL(j.motherName, t.motherName),
        t.othersParents = ISNULL(j.othersParents, t.othersParents),
        t.houseNo = ISNULL(j.houseNo, t.houseNo),
        t.age = ISNULL(j.age, t.age),
        t.gender = ISNULL(j.gender, t.gender),
        t.confidence = ISNULL(j.confidence, t.confidence),
        t.NeedReview = ISNULL(j.NeedReview, t.NeedReview)
      FROM [tbl_TotalVoters] t
      INNER JOIN OPENJSON(@jsonData)
      WITH (
          id NVARCHAR(255),
          voterNo NVARCHAR(100),
          epic NVARCHAR(100),
          name NVARCHAR(255),
          fatherName NVARCHAR(255),
          husbandName NVARCHAR(255),
          motherName NVARCHAR(255),
          othersParents NVARCHAR(255),
          houseNo NVARCHAR(100),
          age INT,
          confidence INT,
          NeedReview BIT,
          gender NVARCHAR(50)
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
