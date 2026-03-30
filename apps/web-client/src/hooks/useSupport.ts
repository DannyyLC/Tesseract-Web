import { useMutation } from '@tanstack/react-query';
import RootApi from '@/app/_api_request_manager/_apis/root-api';
import { ServiceInfoRequestDto } from '@tesseract/types';

// Hook for support mutations (Request Service Info)
export function useSupportMutations() {
  const requestServiceInfo = useMutation({
    mutationFn: async (dto: ServiceInfoRequestDto) => {
      const api = RootApi.getInstance().getSupportApi();
      return await api.requestServiceInfoByEmail(dto);
    },
  });

  return {
    requestServiceInfo,
  };
}
