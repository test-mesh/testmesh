package importer

// HARFile represents a HAR (HTTP Archive) file
type HARFile struct {
	Log HARLog `json:"log"`
}

// HARLog represents the log section of a HAR file
type HARLog struct {
	Version string     `json:"version"`
	Creator HARCreator `json:"creator"`
	Entries []HAREntry `json:"entries"`
	Pages   []HARPage  `json:"pages,omitempty"`
}

// HARCreator represents the creator info
type HARCreator struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// HARPage represents a page in HAR
type HARPage struct {
	StartedDateTime string `json:"startedDateTime"`
	ID              string `json:"id"`
	Title           string `json:"title"`
}

// HAREntry represents a single request/response entry
type HAREntry struct {
	StartedDateTime string      `json:"startedDateTime"`
	Time            float64     `json:"time"`
	Request         HARRequest  `json:"request"`
	Response        HARResponse `json:"response"`
	Cache           HARCache    `json:"cache"`
	Timings         HARTimings  `json:"timings"`
	PageRef         string      `json:"pageref,omitempty"`
}

// HARRequest represents an HTTP request
type HARRequest struct {
	Method      string          `json:"method"`
	URL         string          `json:"url"`
	HTTPVersion string          `json:"httpVersion"`
	Headers     []HARHeader     `json:"headers"`
	QueryString []HARQueryParam `json:"queryString"`
	Cookies     []HARCookie     `json:"cookies"`
	HeadersSize int             `json:"headersSize"`
	BodySize    int             `json:"bodySize"`
	PostData    *HARPostData    `json:"postData,omitempty"`
}

// HARResponse represents an HTTP response
type HARResponse struct {
	Status      int         `json:"status"`
	StatusText  string      `json:"statusText"`
	HTTPVersion string      `json:"httpVersion"`
	Headers     []HARHeader `json:"headers"`
	Cookies     []HARCookie `json:"cookies"`
	Content     HARContent  `json:"content"`
	RedirectURL string      `json:"redirectURL"`
	HeadersSize int         `json:"headersSize"`
	BodySize    int         `json:"bodySize"`
}

// HARHeader represents an HTTP header
type HARHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// HARQueryParam represents a query parameter
type HARQueryParam struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// HARCookie represents a cookie
type HARCookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Path     string `json:"path,omitempty"`
	Domain   string `json:"domain,omitempty"`
	Expires  string `json:"expires,omitempty"`
	HTTPOnly bool   `json:"httpOnly,omitempty"`
	Secure   bool   `json:"secure,omitempty"`
}

// HARPostData represents POST data
type HARPostData struct {
	MimeType string     `json:"mimeType"`
	Text     string     `json:"text,omitempty"`
	Params   []HARParam `json:"params,omitempty"`
}

// HARParam represents a POST parameter
type HARParam struct {
	Name        string `json:"name"`
	Value       string `json:"value,omitempty"`
	FileName    string `json:"fileName,omitempty"`
	ContentType string `json:"contentType,omitempty"`
}

// HARContent represents response content
type HARContent struct {
	Size        int    `json:"size"`
	Compression int    `json:"compression,omitempty"`
	MimeType    string `json:"mimeType"`
	Text        string `json:"text,omitempty"`
	Encoding    string `json:"encoding,omitempty"`
}

// HARCache represents cache info
type HARCache struct{}

// HARTimings represents timing info
type HARTimings struct {
	Blocked float64 `json:"blocked"`
	DNS     float64 `json:"dns"`
	Connect float64 `json:"connect"`
	Send    float64 `json:"send"`
	Wait    float64 `json:"wait"`
	Receive float64 `json:"receive"`
	SSL     float64 `json:"ssl"`
}
