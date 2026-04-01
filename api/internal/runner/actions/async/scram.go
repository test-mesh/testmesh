package async

import (
	"crypto/sha256"
	"crypto/sha512"

	"github.com/IBM/sarama"
	"github.com/xdg-go/scram"
)

// SHA256 and SHA512 are hash generator functions for SCRAM.
var SHA256 scram.HashGeneratorFcn = sha256.New
var SHA512 scram.HashGeneratorFcn = sha512.New

// XDGSCRAMClient implements sarama.SCRAMClient using the xdg-go/scram library.
type XDGSCRAMClient struct {
	*scram.Client
	*scram.ClientConversation
	scram.HashGeneratorFcn
}

func (x *XDGSCRAMClient) Begin(userName, password, authzID string) error {
	client, err := x.HashGeneratorFcn.NewClient(userName, password, authzID)
	if err != nil {
		return err
	}
	x.Client = client
	x.ClientConversation = x.Client.NewConversation()
	return nil
}

func (x *XDGSCRAMClient) Step(challenge string) (string, error) {
	return x.ClientConversation.Step(challenge)
}

func (x *XDGSCRAMClient) Done() bool {
	return x.ClientConversation.Done()
}

// Ensure XDGSCRAMClient implements sarama.SCRAMClient.
var _ sarama.SCRAMClient = (*XDGSCRAMClient)(nil)
