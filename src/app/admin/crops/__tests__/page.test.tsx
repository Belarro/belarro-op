import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminCropsPage from '../page';

// Mock fetch
global.fetch = jest.fn();

describe('AdminCropsPage', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Rendering', () => {
    it('should render the page title and new crop button', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ success: true, data: [] }),
        ok: true,
      });

      render(<AdminCropsPage />);

      await waitFor(() => {
        expect(screen.getByText('Crops')).toBeInTheDocument();
        expect(screen.getByText('+ New Crop')).toBeInTheDocument();
      });
    });

    it('should display loading state initially', () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () => new Promise(() => {})
      );

      render(<AdminCropsPage />);
      expect(screen.getByText('Loading crops...')).toBeInTheDocument();
    });

    it('should render crop list when data loads', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: [
            {
              id: '1',
              name_en: 'Pea Shoots',
              name_de: 'Erbsensprossen',
              status: 'active',
              deleted_at: null,
            },
          ],
        }),
        ok: true,
      });

      render(<AdminCropsPage />);

      await waitFor(() => {
        expect(screen.getByText('Pea Shoots')).toBeInTheDocument();
        expect(screen.getByText('Erbsensprossen')).toBeInTheDocument();
      });
    });
  });

  describe('New Crop Flow', () => {
    it('should open new crop form when + New Crop clicked', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ success: true, data: [] }),
        ok: true,
      });

      render(<AdminCropsPage />);

      const newCropButton = await screen.findByText('+ New Crop');
      await userEvent.click(newCropButton);

      await waitFor(() => {
        expect(screen.getAllByDisplayValue('')).not.toHaveLength(0);
      });
    });

    it('should validate required fields before saving', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ success: true, data: [] }),
        ok: true,
      });

      render(<AdminCropsPage />);

      const newCropButton = await screen.findByText('+ New Crop');
      await userEvent.click(newCropButton);

      const saveButton = await screen.findByText('Save');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Name \(EN\) and Name \(DE\) are required/i)
        ).toBeInTheDocument();
      });
    });

    it('should create new crop with all data', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: [] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: 'new-1',
              name_en: 'Test Crop',
              name_de: 'Test Ernte',
              flavor_en: 'Sweet',
              flavor_de: 'Süß',
              status: 'active',
              procedure: {
                soak_enabled: true,
                soak_hours: 12,
                growth_env_type: 'light',
                growth_env_days: 6,
              },
              variants: [{ size_name: '100g', size_grams: 100, price_eur: 6.5 }],
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const newCropButton = await screen.findByText('+ New Crop');
      await userEvent.click(newCropButton);

      const nameEnInput = screen.getAllByPlaceholderText('e.g., Pea Shoots')[0];
      const nameDeInput = screen.getAllByPlaceholderText('e.g., Erbsensprossen')[0];

      await userEvent.type(nameEnInput, 'Test Crop');
      await userEvent.type(nameDeInput, 'Test Ernte');

      // Go to Procedure tab and set growth environment days
      const procedureTab = screen.getByText('Growth Procedure');
      await userEvent.click(procedureTab);

      const daysInput = screen.getByRole('spinbutton');
      await userEvent.clear(daysInput);
      await userEvent.type(daysInput, '6');

      const saveButton = screen.getByText('Save');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/crops',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });
  });

  describe('Crop Selection & Editing', () => {
    it('should load crop data when selected', async () => {
      const mockCrops = [
        {
          id: '1',
          name_en: 'Pea Shoots',
          name_de: 'Erbsensprossen',
          status: 'active',
          deleted_at: null,
        },
      ];

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: mockCrops }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: [] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              ...mockCrops[0],
              flavor_en: 'Sweet',
              procedure: {
                soak_enabled: false,
                growth_env_type: 'light',
                growth_env_days: 6,
              },
              variants: [],
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = await screen.findByText('Pea Shoots');
      await userEvent.click(cropItem);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/crops/1')
        );
      });
    });

    it('should enter edit mode when Edit button clicked', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Pea Shoots',
                name_de: 'Erbsensprossen',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Pea Shoots',
              name_de: 'Erbsensprossen',
              flavor_en: 'Sweet',
              status: 'active',
              procedure: {
                soak_enabled: false,
                growth_env_type: 'light',
                growth_env_days: 6,
              },
              variants: [],
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = await screen.findByText('Pea Shoots');
      await userEvent.click(cropItem);

      const editButton = await screen.findByText('Edit');
      await userEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
        expect(screen.getByText('Save')).toBeInTheDocument();
      });
    });
  });

  describe('Procedures Tab', () => {
    it('should toggle soak and show hours input', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Pea Shoots',
                name_de: 'Erbsensprossen',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Pea Shoots',
              name_de: 'Erbsensprossen',
              status: 'active',
              procedure: {
                soak_enabled: false,
                growth_env_type: 'light',
                growth_env_days: 6,
              },
              variants: [],
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = await screen.findByText('Pea Shoots');
      await userEvent.click(cropItem);

      const procedureTab = await screen.findByText('Growth Procedure');
      await userEvent.click(procedureTab);

      const editButton = await screen.findByText('Edit');
      await userEvent.click(editButton);

      const soakCheckbox = screen.getByRole('checkbox', { name: /soak/i });
      await userEvent.click(soakCheckbox);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Hours')).toBeInTheDocument();
      });
    });

    it('should calculate total growth days correctly', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Test',
                name_de: 'Test',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: [] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Test',
              name_de: 'Test',
              status: 'active',
              procedure: {
                soak_enabled: false,
                stack_enabled: true,
                stack_days: 2,
                light_enabled: true,
                light_days: 6,
              },
              variants: [],
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = (await screen.findAllByText('Test'))[0];
      await userEvent.click(cropItem);

      const procedureTab = await screen.findByText('Growth Procedure');
      await userEvent.click(procedureTab);

      await waitFor(() => {
        expect(screen.getByText('Total Growth Days:')).toBeInTheDocument();
        expect(screen.getByText('8')).toBeInTheDocument();
      });
    });
  });

  describe('Sizes & Prices Tab', () => {
    it('should display existing variants', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Pea Shoots',
                name_de: 'Erbsensprossen',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: [] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Pea Shoots',
              name_de: 'Erbsensprossen',
              status: 'active',
              variants: [
                { id: 'v1', size_name: '100g', size_grams: 100, price_eur: 6.5 },
                { id: 'v2', size_name: '225g', size_grams: 225, price_eur: 14.5 },
              ],
              procedure: { growth_env_type: 'light', growth_env_days: 6 },
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = await screen.findByText('Pea Shoots');
      await userEvent.click(cropItem);

      const sizesTab = await screen.findByText('Sizes & Prices');
      await userEvent.click(sizesTab);

      await waitFor(() => {
        expect(screen.getAllByText('100g')[0]).toBeInTheDocument();
        expect(screen.getAllByText('225g')[0]).toBeInTheDocument();
      });
    });

    it('should add new variant when in edit mode', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Test',
                name_de: 'Test',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: [] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Test',
              name_de: 'Test',
              status: 'active',
              variants: [],
              procedure: { growth_env_type: 'light', growth_env_days: 6 },
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = (await screen.findAllByText('Test'))[0];
      await userEvent.click(cropItem);

      const sizesTab = await screen.findByText('Sizes & Prices');
      await userEvent.click(sizesTab);

      const editButton = await screen.findByText('Edit');
      await userEvent.click(editButton);

      const addNewSizeButton = await screen.findByText('+ Add New Size');
      await userEvent.click(addNewSizeButton);

      const sizeNameInput = screen.getByPlaceholderText('e.g., 600g');
      const gramsInput = screen.getByPlaceholderText('e.g., 600');
      const priceInput = screen.getByPlaceholderText('e.g., 18.50');

      await userEvent.type(sizeNameInput, '600g');
      await userEvent.type(gramsInput, '600');
      await userEvent.type(priceInput, '18.50');

      const addButton = screen.getByText('Add Size');
      await userEvent.click(addButton);
      await waitFor(() => {
        expect(screen.getAllByText('600g')[0]).toBeInTheDocument();
      });
    });
  });

  describe('Delete Functionality', () => {
    it('should show delete confirmation modal', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Pea Shoots',
                name_de: 'Erbsensprossen',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Pea Shoots',
              name_de: 'Erbsensprossen',
              status: 'active',
              procedure: { growth_env_type: 'light', growth_env_days: 6 },
              variants: [],
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = await screen.findByText('Pea Shoots');
      await userEvent.click(cropItem);

      const deleteButton = await screen.findByText('Delete');
      await userEvent.click(deleteButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Are you sure you want to delete/i)
        ).toBeInTheDocument();
      });
    });

    it('should delete crop when confirmed', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Pea Shoots',
                name_de: 'Erbsensprossen',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Pea Shoots',
              name_de: 'Erbsensprossen',
              status: 'active',
              procedure: { growth_env_type: 'light', growth_env_days: 6 },
              variants: [],
            },
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: { id: '1' } }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: [] }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = await screen.findByText('Pea Shoots');
      await userEvent.click(cropItem);

      const deleteButton = await screen.findByText('Delete');
      await userEvent.click(deleteButton);

      const confirmDeleteButton = (await screen.findAllByRole('button', { name: 'Delete' }))[1];
      await userEvent.click(confirmDeleteButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/crops/1'),
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error toast on API failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ success: false, error: 'API Error' }),
        ok: true,
      });

      render(<AdminCropsPage />);

      await waitFor(() => {
        expect(screen.getByText('API Error')).toBeInTheDocument();
      });
    });

    it('should validate stack days when stack is enabled', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: [
              {
                id: '1',
                name_en: 'Test',
                name_de: 'Test',
                status: 'active',
                deleted_at: null,
              },
            ],
          }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ success: true, data: [] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({
            success: true,
            data: {
              id: '1',
              name_en: 'Test',
              name_de: 'Test',
              status: 'active',
              procedure: {
                stack_enabled: true,
                stack_days: undefined,
                light_enabled: true,
                light_days: 6,
              },
              variants: [],
            },
          }),
          ok: true,
        });

      render(<AdminCropsPage />);

      const cropItem = (await screen.findAllByText('Test'))[0];
      await userEvent.click(cropItem);

      const editButton = await screen.findByText('Edit');
      await userEvent.click(editButton);

      const saveButton = screen.getByText('Save');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Stack days required if stack is enabled/i)
        ).toBeInTheDocument();
      });
    });
  });
});
