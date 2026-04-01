package handlers

import (
	"context"
	"recommendation-service/graph"
	pb "recommendation-service/proto"
)

// GRPCHandler implements the RecommendationService gRPC interface.
type GRPCHandler struct {
	pb.UnimplementedRecommendationServiceServer
	graphClient *graph.Client
}

func NewGRPCHandler(graphClient *graph.Client) *GRPCHandler {
	return &GRPCHandler{graphClient: graphClient}
}

func (h *GRPCHandler) GetRecommendations(ctx context.Context, req *pb.UserRequest) (*pb.ProductList, error) {
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 10
	}

	ids, err := h.graphClient.GetRecommendationsForUser(ctx, req.UserId, limit)
	if err != nil {
		return &pb.ProductList{ProductIds: []string{}}, nil
	}
	if ids == nil {
		ids = []string{}
	}
	return &pb.ProductList{ProductIds: ids}, nil
}

func (h *GRPCHandler) GetSimilarProducts(ctx context.Context, req *pb.ProductRequest) (*pb.ProductList, error) {
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 10
	}

	ids, err := h.graphClient.GetSimilarProducts(ctx, req.ProductId, limit)
	if err != nil {
		return &pb.ProductList{ProductIds: []string{}}, nil
	}
	if ids == nil {
		ids = []string{}
	}
	return &pb.ProductList{ProductIds: ids}, nil
}
