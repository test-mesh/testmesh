package code

import (
	"os"
	"path/filepath"
	"strings"
)

// Language represents a detected programming language.
type Language string

const (
	LangGo         Language = "go"
	LangTypeScript Language = "typescript"
	LangPython     Language = "python"
	LangJava       Language = "java"
	LangCSharp     Language = "csharp"
)

// DetectedProject describes a detected language/framework in a repository.
type DetectedProject struct {
	Language   Language
	Root       string   // Relative path to project root
	Frameworks []string // Detected frameworks
}

// DetectProjects scans a repository for language-specific projects.
func DetectProjects(repoPath string) []DetectedProject {
	var projects []DetectedProject

	// Check for Go
	if exists(repoPath, "go.mod") {
		frameworks := detectGoFrameworks(repoPath)
		projects = append(projects, DetectedProject{
			Language:   LangGo,
			Root:       ".",
			Frameworks: frameworks,
		})
	}

	// Check for TypeScript/Node.js
	if exists(repoPath, "package.json") || exists(repoPath, "tsconfig.json") {
		frameworks := detectTSFrameworks(repoPath)
		projects = append(projects, DetectedProject{
			Language:   LangTypeScript,
			Root:       ".",
			Frameworks: frameworks,
		})
	}

	// Check for Python
	if exists(repoPath, "requirements.txt") || exists(repoPath, "pyproject.toml") ||
		exists(repoPath, "setup.py") || exists(repoPath, "Pipfile") {
		frameworks := detectPythonFrameworks(repoPath)
		projects = append(projects, DetectedProject{
			Language:   LangPython,
			Root:       ".",
			Frameworks: frameworks,
		})
	}

	// Check for Java
	if exists(repoPath, "pom.xml") || exists(repoPath, "build.gradle") ||
		exists(repoPath, "build.gradle.kts") {
		frameworks := detectJavaFrameworks(repoPath)
		projects = append(projects, DetectedProject{
			Language:   LangJava,
			Root:       ".",
			Frameworks: frameworks,
		})
	}

	// Check for C#
	csprojFiles, _ := filepath.Glob(filepath.Join(repoPath, "*.csproj"))
	slnFiles, _ := filepath.Glob(filepath.Join(repoPath, "*.sln"))
	if len(csprojFiles) > 0 || len(slnFiles) > 0 {
		frameworks := detectCSharpFrameworks(repoPath)
		projects = append(projects, DetectedProject{
			Language:   LangCSharp,
			Root:       ".",
			Frameworks: frameworks,
		})
	}

	// Check subdirectories for monorepos
	entries, err := os.ReadDir(repoPath)
	if err != nil {
		return projects
	}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") ||
			entry.Name() == "node_modules" || entry.Name() == "vendor" {
			continue
		}
		subPath := filepath.Join(repoPath, entry.Name())
		subProjects := DetectProjects(subPath)
		for i := range subProjects {
			subProjects[i].Root = entry.Name()
		}
		projects = append(projects, subProjects...)
	}

	return projects
}

func detectGoFrameworks(root string) []string {
	content := readFile(filepath.Join(root, "go.mod"))
	var frameworks []string
	if strings.Contains(content, "gin-gonic/gin") {
		frameworks = append(frameworks, "gin")
	}
	if strings.Contains(content, "labstack/echo") {
		frameworks = append(frameworks, "echo")
	}
	if strings.Contains(content, "go-chi/chi") {
		frameworks = append(frameworks, "chi")
	}
	if strings.Contains(content, "gofiber/fiber") {
		frameworks = append(frameworks, "fiber")
	}
	if strings.Contains(content, "Shopify/sarama") || strings.Contains(content, "IBM/sarama") {
		frameworks = append(frameworks, "sarama")
	}
	if strings.Contains(content, "confluent-kafka-go") {
		frameworks = append(frameworks, "confluent-kafka")
	}
	if strings.Contains(content, "gorm.io/gorm") {
		frameworks = append(frameworks, "gorm")
	}
	if strings.Contains(content, "jmoiron/sqlx") {
		frameworks = append(frameworks, "sqlx")
	}
	if strings.Contains(content, "google.golang.org/grpc") {
		frameworks = append(frameworks, "grpc")
	}
	if strings.Contains(content, "go-redis") {
		frameworks = append(frameworks, "redis")
	}
	return frameworks
}

func detectTSFrameworks(root string) []string {
	content := readFile(filepath.Join(root, "package.json"))
	var frameworks []string
	if strings.Contains(content, "express") {
		frameworks = append(frameworks, "express")
	}
	if strings.Contains(content, "fastify") {
		frameworks = append(frameworks, "fastify")
	}
	if strings.Contains(content, "@nestjs/core") {
		frameworks = append(frameworks, "nestjs")
	}
	if strings.Contains(content, "\"next\"") {
		frameworks = append(frameworks, "nextjs")
	}
	if strings.Contains(content, "kafkajs") {
		frameworks = append(frameworks, "kafkajs")
	}
	if strings.Contains(content, "prisma") {
		frameworks = append(frameworks, "prisma")
	}
	if strings.Contains(content, "typeorm") {
		frameworks = append(frameworks, "typeorm")
	}
	if strings.Contains(content, "sequelize") {
		frameworks = append(frameworks, "sequelize")
	}
	if strings.Contains(content, "@grpc/grpc-js") {
		frameworks = append(frameworks, "grpc")
	}
	if strings.Contains(content, "ioredis") || strings.Contains(content, "\"redis\"") {
		frameworks = append(frameworks, "redis")
	}
	return frameworks
}

func detectPythonFrameworks(root string) []string {
	content := readFile(filepath.Join(root, "requirements.txt"))
	content += readFile(filepath.Join(root, "pyproject.toml"))
	var frameworks []string
	if strings.Contains(content, "fastapi") {
		frameworks = append(frameworks, "fastapi")
	}
	if strings.Contains(content, "django") || strings.Contains(content, "Django") {
		frameworks = append(frameworks, "django")
	}
	if strings.Contains(content, "flask") || strings.Contains(content, "Flask") {
		frameworks = append(frameworks, "flask")
	}
	if strings.Contains(content, "confluent-kafka") || strings.Contains(content, "aiokafka") {
		frameworks = append(frameworks, "kafka")
	}
	if strings.Contains(content, "sqlalchemy") || strings.Contains(content, "SQLAlchemy") {
		frameworks = append(frameworks, "sqlalchemy")
	}
	if strings.Contains(content, "grpcio") {
		frameworks = append(frameworks, "grpc")
	}
	if strings.Contains(content, "redis") {
		frameworks = append(frameworks, "redis")
	}
	return frameworks
}

func detectJavaFrameworks(root string) []string {
	content := readFile(filepath.Join(root, "pom.xml"))
	content += readFile(filepath.Join(root, "build.gradle"))
	content += readFile(filepath.Join(root, "build.gradle.kts"))
	var frameworks []string
	if strings.Contains(content, "spring-boot") {
		frameworks = append(frameworks, "spring-boot")
	}
	if strings.Contains(content, "micronaut") {
		frameworks = append(frameworks, "micronaut")
	}
	if strings.Contains(content, "kafka") {
		frameworks = append(frameworks, "kafka")
	}
	if strings.Contains(content, "spring-data-jpa") || strings.Contains(content, "hibernate") {
		frameworks = append(frameworks, "jpa")
	}
	if strings.Contains(content, "grpc") {
		frameworks = append(frameworks, "grpc")
	}
	return frameworks
}

func detectCSharpFrameworks(root string) []string {
	csprojFiles, _ := filepath.Glob(filepath.Join(root, "*.csproj"))
	var content string
	for _, f := range csprojFiles {
		content += readFile(f)
	}
	var frameworks []string
	if strings.Contains(content, "Microsoft.AspNetCore") {
		frameworks = append(frameworks, "aspnet")
	}
	if strings.Contains(content, "EntityFrameworkCore") {
		frameworks = append(frameworks, "efcore")
	}
	if strings.Contains(content, "Confluent.Kafka") {
		frameworks = append(frameworks, "kafka")
	}
	if strings.Contains(content, "Grpc") {
		frameworks = append(frameworks, "grpc")
	}
	return frameworks
}

func exists(root, name string) bool {
	_, err := os.Stat(filepath.Join(root, name))
	return err == nil
}

func readFile(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}
