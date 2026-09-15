import { Request, Response, NextFunction } from 'express';
import * as exampleService from '../services/exampleService';

export const getExamples = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const examples = await exampleService.getAllExamples();
    res.status(200).json({ success: true, data: examples });
  } catch (error) {
    next(error);
  }
};

export const getExampleById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const example = await exampleService.getExampleById(req.params.id);
    if (!example) {
      res.status(404).json({ success: false, message: 'Example not found' });
      return;
    }
    res.status(200).json({ success: true, data: example });
  } catch (error) {
    next(error);
  }
};

export const createExample = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const example = await exampleService.createExample(req.body);
    res.status(201).json({ success: true, data: example });
  } catch (error) {
    next(error);
  }
};

export const updateExample = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const example = await exampleService.updateExample(req.params.id, req.body);
    if (!example) {
      res.status(404).json({ success: false, message: 'Example not found' });
      return;
    }
    res.status(200).json({ success: true, data: example });
  } catch (error) {
    next(error);
  }
};

export const deleteExample = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await exampleService.deleteExample(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Example not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Example deleted' });
  } catch (error) {
    next(error);
  }
};
