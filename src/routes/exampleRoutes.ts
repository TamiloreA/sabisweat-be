import { Router } from 'express';
import {
  getExamples,
  getExampleById,
  createExample,
  updateExample,
  deleteExample,
} from '../controllers/exampleController';

const router = Router();

/**
 * @openapi
 * /examples:
 *   get:
 *     summary: Get all examples
 *     tags: [Examples]
 *     responses:
 *       200:
 *         description: List of examples
 */
router.get('/', getExamples);

/**
 * @openapi
 * /examples/{id}:
 *   get:
 *     summary: Get example by ID
 *     tags: [Examples]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Example found
 *       404:
 *         description: Example not found
 */
router.get('/:id', getExampleById);

/**
 * @openapi
 * /examples:
 *   post:
 *     summary: Create a new example
 *     tags: [Examples]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Example created
 */
router.post('/', createExample);

/**
 * @openapi
 * /examples/{id}:
 *   put:
 *     summary: Update an example
 *     tags: [Examples]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Example updated
 *       404:
 *         description: Example not found
 */
router.put('/:id', updateExample);

/**
 * @openapi
 * /examples/{id}:
 *   delete:
 *     summary: Delete an example
 *     tags: [Examples]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Example deleted
 *       404:
 *         description: Example not found
 */
router.delete('/:id', deleteExample);

export default router;
