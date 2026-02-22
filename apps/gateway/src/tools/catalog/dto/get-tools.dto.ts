export class GetToolsDto {
    id: string;
    toolName: string;
    displayName: string;
    description: string;
    provider: string;
    isActive: boolean;
    isInBeta: boolean;
    icon: string;
    category: string;
    functions: {
        id: string;
        functionName: string;
        displayName: string;
        description: string;
        category: string;
        isActive: boolean;
        isInBeta: boolean;
        icon: string;
        dangerLevel: string;
    }[];
}