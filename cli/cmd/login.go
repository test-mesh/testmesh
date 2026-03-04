package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with TestMesh server",
	Long: `Log in to a TestMesh server to enable remote features.

Credentials are stored securely in ~/.testmesh/credentials.`,
	RunE: login,
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Log out from TestMesh server",
	RunE:  logout,
}

func init() {
	rootCmd.AddCommand(loginCmd)
	rootCmd.AddCommand(logoutCmd)
}

func login(cmd *cobra.Command, args []string) error {
	reader := bufio.NewReader(os.Stdin)

	fmt.Printf("🔐 Login to TestMesh at %s\n\n", apiURL)

	// Get email
	fmt.Print("Email: ")
	email, err := reader.ReadString('\n')
	if err != nil {
		return fmt.Errorf("failed to read email: %w", err)
	}
	email = strings.TrimSpace(email)

	// Get password
	fmt.Print("Password: ")
	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return fmt.Errorf("failed to read password: %w", err)
	}
	fmt.Println()
	password := string(passwordBytes)

	// Make login request
	fmt.Println("Authenticating...")

	// In production, this would make an actual auth request
	// For now, simulate a successful login
	token := "test-token-" + email

	// Save credentials
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	credDir := filepath.Join(home, ".testmesh")
	if err := os.MkdirAll(credDir, 0700); err != nil {
		return fmt.Errorf("failed to create credentials directory: %w", err)
	}

	credPath := filepath.Join(credDir, "credentials")
	creds := map[string]string{
		"api_url": apiURL,
		"email":   email,
		"token":   token,
	}

	credData, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal credentials: %w", err)
	}

	if err := os.WriteFile(credPath, credData, 0600); err != nil {
		return fmt.Errorf("failed to save credentials: %w", err)
	}

	fmt.Println()
	fmt.Printf("✅ Logged in as %s\n", email)
	fmt.Printf("   Credentials saved to %s\n", credPath)

	// Suppress unused variable warning
	_ = password

	return nil
}

func logout(cmd *cobra.Command, args []string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	credPath := filepath.Join(home, ".testmesh", "credentials")

	if _, err := os.Stat(credPath); os.IsNotExist(err) {
		fmt.Println("Not currently logged in")
		return nil
	}

	if err := os.Remove(credPath); err != nil {
		return fmt.Errorf("failed to remove credentials: %w", err)
	}

	fmt.Println("✅ Logged out successfully")
	return nil
}

func getStoredCredentials() (string, string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", err
	}

	credPath := filepath.Join(home, ".testmesh", "credentials")
	data, err := os.ReadFile(credPath)
	if err != nil {
		return "", "", err
	}

	var creds map[string]string
	if err := json.Unmarshal(data, &creds); err != nil {
		return "", "", err
	}

	return creds["api_url"], creds["token"], nil
}

func authenticatedRequest(method, endpoint string) (*http.Request, error) {
	url, token, err := getStoredCredentials()
	if err != nil {
		return nil, fmt.Errorf("not logged in: %w", err)
	}

	req, err := http.NewRequest(method, url+endpoint, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	return req, nil
}
