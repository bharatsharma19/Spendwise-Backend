import { ExpenseService } from '../../services/expense.service';
import { db } from '../../config/firebase';
import { NotFoundError, AuthorizationError } from '../../utils/error';
import { CreateExpenseDto } from '../../models/expense.model';

// Mock Firebase
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn(),
  },
}));

describe('ExpenseService', () => {
  let expenseService: ExpenseService;
  let mockCollection: jest.Mock;
  let mockDoc: jest.Mock;
  let mockWhere: jest.Mock;
  let mockOrderBy: jest.Mock;
  let mockAdd: jest.Mock;
  let mockGet: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockDelete: jest.Mock;

  const mockDate = new Date('2023-01-01');
  const mockUserId = 'user123';
  const mockExpenseId = 'expense123';

  const mockExpenseData = {
    userId: mockUserId,
    amount: 100,
    category: 'food',
    description: 'Lunch',
    date: mockDate,
    createdAt: mockDate,
    updatedAt: mockDate,
    currency: 'INR',
    isRecurring: false,
    isSplit: false,
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock chain
    mockGet = jest.fn();
    mockAdd = jest.fn();
    mockUpdate = jest.fn();
    mockDelete = jest.fn();
    mockDoc = jest.fn(() => ({
      get: mockGet,
      update: mockUpdate,
      delete: mockDelete,
      id: mockExpenseId,
    }));
    mockOrderBy = jest.fn(() => ({
      get: mockGet,
    }));
    mockWhere = jest.fn(() => ({
      where: mockWhere,
      orderBy: mockOrderBy,
      get: mockGet,
    }));
    mockCollection = jest.fn(() => ({
      doc: mockDoc,
      where: mockWhere,
      add: mockAdd,
    }));

    (db.collection as jest.Mock) = mockCollection;

    // Create service instance
    expenseService = ExpenseService.getInstance();

    // Setup default successful response for document operations
    mockGet.mockResolvedValue({
      exists: true,
      id: mockExpenseId,
      data: () => ({ ...mockExpenseData }),
      docs: [
        {
          id: mockExpenseId,
          exists: true,
          data: () => ({ ...mockExpenseData }),
        },
      ],
    });

    mockAdd.mockResolvedValue({
      id: mockExpenseId,
    });
  });

  describe('createExpense', () => {
    it('should create a new expense successfully', async () => {
      const createExpenseData: CreateExpenseDto = {
        amount: 100,
        category: 'food',
        description: 'Lunch',
        date: mockDate,
        currency: 'INR',
        isRecurring: false,
        isSplit: false,
      };

      mockAdd.mockResolvedValue({ id: mockExpenseId });

      const result = await expenseService.createExpense(mockUserId, createExpenseData);

      expect(mockCollection).toHaveBeenCalledWith('expenses');
      expect(mockAdd).toHaveBeenCalled();
      expect(result).toHaveProperty('id', mockExpenseId);
      expect(result).toHaveProperty('amount', 100);
      expect(result).toHaveProperty('category', 'food');
    });
  });

  describe('getExpenseById', () => {
    it('should retrieve an expense by ID', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: mockExpenseId,
        data: () => ({ ...mockExpenseData }),
      });

      const result = await expenseService.getExpenseById(mockUserId, mockExpenseId);

      expect(mockCollection).toHaveBeenCalledWith('expenses');
      expect(mockDoc).toHaveBeenCalledWith(mockExpenseId);
      expect(result).toHaveProperty('id', mockExpenseId);
      expect(result).toHaveProperty('amount', 100);
      expect(result).toHaveProperty('category', 'food');
    });

    it('should throw NotFoundError if expense does not exist', async () => {
      mockGet.mockResolvedValue({
        exists: false,
        data: () => null,
      });

      await expect(expenseService.getExpenseById(mockUserId, mockExpenseId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw AuthorizationError if userId does not match', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          ...mockExpenseData,
          userId: 'other-user',
        }),
      });

      await expect(expenseService.getExpenseById(mockUserId, mockExpenseId)).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe('getExpensesByUserId', () => {
    it('should retrieve expenses for a user', async () => {
      mockGet.mockResolvedValue({
        docs: [
          {
            id: 'expense1',
            data: () => ({
              ...mockExpenseData,
              amount: 100,
            }),
          },
          {
            id: 'expense2',
            data: () => ({
              ...mockExpenseData,
              amount: 200,
              category: 'transportation',
            }),
          },
        ],
      });

      const result = await expenseService.getExpensesByUserId(mockUserId);

      expect(mockCollection).toHaveBeenCalledWith('expenses');
      expect(mockWhere).toHaveBeenCalledWith('userId', '==', mockUserId);
      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 'expense1');
      expect(result[1]).toHaveProperty('id', 'expense2');
    });
  });

  describe('getExpenseTrends', () => {
    it('should calculate expense trends correctly', async () => {
      const mockExpenses = [
        {
          id: 'expense1',
          data: () => ({
            ...mockExpenseData,
            amount: 100,
            category: 'food',
            date: mockDate,
          }),
        },
        {
          id: 'expense2',
          data: () => ({
            ...mockExpenseData,
            amount: 200,
            category: 'food',
            date: mockDate,
          }),
        },
        {
          id: 'expense3',
          data: () => ({
            ...mockExpenseData,
            amount: 150,
            category: 'transportation',
            date: mockDate,
          }),
        },
      ];

      mockGet.mockResolvedValueOnce({
        docs: mockExpenses,
        exists: true,
      });

      const result = await expenseService.getExpenseTrends(mockUserId, 'monthly');

      expect(mockCollection).toHaveBeenCalledWith('expenses');
      expect(mockWhere).toHaveBeenCalledWith('userId', '==', mockUserId);
      expect(result).toHaveProperty('total', 450);
      expect(result).toHaveProperty('count', 3);
      expect(result.byCategory).toHaveProperty('food');
      expect(result.byCategory.food).toHaveProperty('total', 300);
      expect(result.byCategory.transportation).toHaveProperty('total', 150);
      expect(result.byDate).toHaveProperty('2023-01');
    });
  });
});
