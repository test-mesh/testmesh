package ai

import (
	"github.com/test-mesh/testmesh/internal/graph"
)

// ConfidenceScorer calculates node/edge confidence based on multi-layer corroboration.
// A node seen in both code and infra layers is more confident than one seen only in code.
type ConfidenceScorer struct{}

// NewConfidenceScorer creates a confidence scorer.
func NewConfidenceScorer() *ConfidenceScorer {
	return &ConfidenceScorer{}
}

// layerWeight assigns a base weight to each source layer.
var layerWeight = map[graph.SourceLayer]float64{
	graph.SourceLayerRuntime: 0.95,
	graph.SourceLayerCode:    0.85,
	graph.SourceLayerSpec:    0.80,
	graph.SourceLayerInfra:   0.75,
	graph.SourceLayerFlow:    0.70,
	graph.SourceLayerHistory: 0.60,
}

// ScoreNode calculates an adjusted confidence for a node based on how many
// layers corroborate its existence.
func (cs *ConfidenceScorer) ScoreNode(node graph.GraphNode, corroboratingLayers []graph.SourceLayer) float64 {
	base := node.Confidence
	if base == 0 {
		base = layerWeight[node.SourceLayer]
	}

	// Each additional layer that confirms this node boosts confidence
	boost := 0.0
	for _, layer := range corroboratingLayers {
		if layer != node.SourceLayer {
			boost += 0.05 // +5% per corroborating layer
		}
	}

	score := base + boost
	if score > 1.0 {
		score = 1.0
	}
	return score
}

// ScoreEdge calculates adjusted confidence for an edge.
func (cs *ConfidenceScorer) ScoreEdge(edge graph.GraphEdge, corroboratingLayers []graph.SourceLayer) float64 {
	base := edge.Confidence
	if base == 0 {
		base = layerWeight[edge.SourceLayer]
	}

	boost := 0.0
	for _, layer := range corroboratingLayers {
		if layer != edge.SourceLayer {
			boost += 0.05
		}
	}

	score := base + boost
	if score > 1.0 {
		score = 1.0
	}
	return score
}

// ClassifyConfidence returns a human-readable classification.
func ClassifyConfidence(score float64) string {
	switch {
	case score >= 0.9:
		return "high"
	case score >= 0.7:
		return "medium"
	case score >= 0.5:
		return "low"
	default:
		return "very_low"
	}
}
